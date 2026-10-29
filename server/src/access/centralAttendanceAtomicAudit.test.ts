import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { AccessError } from "./policy.js";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";

const TOKEN = "a".repeat(64);
const NOW = new Date();
const call = { machineId: "37", category: "maintenance", status: "open", isSystemTest: false };
const baseUser = {
  id: "user-37", login: "technician", displayName: "Técnico de manutenção",
  roleLabel: "Maintenance", accountType: "person",
  active: true, authorizationVersion: 2, mustChangePassword: false,
  isPrimaryAdmin: false, machineScope: "selected",
  permissions: [{ key: "andon.read" }, { key: "calls.attend" }],
  machines: [{ machineId: "37" }],
};
const baseStation = {
  id: "station-37", active: true, pendingApproval: false,
  allowOperational: true, allowBi: false, allowPriorities: false,
};

type Options = {
  callMachine?: string;
  afterLockState?: "open" | "in_progress";
  foreignMachine?: boolean;
  revokeAfterFirstRead?: boolean;
  inactiveStationAfterLock?: boolean;
  auditThrows?: boolean;
  transitionThrows?: boolean;
  missingPermission?: boolean;
};

function fixture(opts: Options = {}) {
  const log: string[] = [];
  const staged: string[] = [];
  let committed = false;
  let authReads = 0;
  let stationReads = 0;
  let lockCount = 0;
  const tx = {
    accessSession: {
      findUnique: async (args: { where: { tokenHash: string }; select?: unknown }) => {
        assert.equal(args.where.tokenHash, tokenHash(TOKEN));
        if (args.select) {
          log.push("session-token-lookup");
          return { userId: baseUser.id };
        }
        authReads++;
        log.push("session-validate-" + authReads);
        return {
          id: "session-37", userId: baseUser.id, workstationId: baseStation.id,
          createdAt: NOW, expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
          lastInteractionAt: NOW, authorizationVersion: 2, purpose: "normal",
          revokedAt: opts.revokeAfterFirstRead && authReads > 1 ? NOW : null,
          user: opts.missingPermission
            ? { ...baseUser, permissions: [{ key: "andon.read" }] }
            : baseUser,
          workstation: baseStation,
        };
      },
    },
    workstation: {
      findUnique: async () => {
        stationReads++;
        log.push("station-validate-" + stationReads);
        return opts.inactiveStationAfterLock && stationReads > 1
          ? { ...baseStation, active: false }
          : baseStation;
      },
    },
    andonCall: {
      findUnique: async () => {
        log.push(lockCount < 3 ? "call-before-lock" : "call-after-lock");
        return {
          ...call,
          machineId: opts.foreignMachine ? "39" : opts.callMachine ?? "37",
          status: lockCount >= 3 && opts.afterLockState ? opts.afterLockState : "open",
        };
      },
    },
    machine: {
      findUnique: async () => {
        log.push("machine-active");
        return { isActive: true };
      },
    },
    $queryRaw: async () => {
      lockCount++;
      log.push(lockCount === 1 ? "lock-user" : lockCount === 2 ? "lock-workstation" : "lock-machine");
      return [{ lockResult: "" }];
    },
    auditEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        log.push("audit");
        if (opts.auditThrows) throw new Error("audit database write failed");
        assert.equal(args.data.actorUserId, baseUser.id);
        assert.equal(args.data.action, "calls.attend");
        assert.equal(args.data.machineId, "37");
        assert.equal(args.data.resourceId, "call-37");
        assert.equal(args.data.actorType, "user");
        assert.equal(args.data.workstationId, baseStation.id);
        assert.deepEqual(args.data.after, { technicianId: "tech-1" });
        staged.push("audit");
        return { id: "audit-1" };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const db = {
    $transaction: async (callback: (t: Prisma.TransactionClient) => Promise<unknown>) => {
      log.push("transaction-begin");
      try {
        const result = await callback(tx);
        committed = true;
        log.push("transaction-commit");
        return result;
      } catch (error) {
        staged.length = 0;
        log.push("transaction-rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  const run = (overrides: Partial<Parameters<typeof runCentralAttendanceWithAtomicAudit>[1]> = {}) =>
    runCentralAttendanceWithAtomicAudit(db, {
      token: TOKEN, workstationId: "station-37", callId: "call-37",
      verifyAndApplyAttendance: async (_, context) => {
        log.push("domain-verify-and-transition");
        assert.deepEqual(context, {
          callId: "call-37", machineId: "37", category: "maintenance", status: "open",
        });
        if (opts.transitionThrows) throw new Error("technician PIN denied");
        staged.push("transition");
        return { value: { ok: true }, technicianId: "tech-1" };
      },
      ...overrides,
    });
  return { run, log, staged, get committed() { return committed; } };
}

async function deny(action: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}

test("SEC-04/2A.3: authorized attendance locks user then machine and audits in one commit", async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), { ok: true });
  assert.deepEqual(f.log, [
    "transaction-begin", "session-token-lookup", "lock-user", "lock-workstation",
    "session-validate-1", "station-validate-1", "call-before-lock",
    "lock-machine", "call-after-lock", "machine-active",
    "session-validate-2", "station-validate-2",
    "domain-verify-and-transition", "audit", "transaction-commit",
  ]);
  assert(f.committed);
  assert.deepEqual(f.staged, ["transition", "audit"]);
});

test("SEC-04/2A.3: malformed tokens never reach database and invalid permissions never mutate", async () => {
  const badToken = fixture();
  await deny(badToken.run({ token: "bogus" }), "authentication_required", 401);
  assert.deepEqual(badToken.log, []);
  const missingPermission = fixture({ missingPermission: true });
  await deny(missingPermission.run(), "permission_denied");
  assert(!missingPermission.log.includes("lock-machine"));
  assert(!missingPermission.log.includes("domain-verify-and-transition"));
  assert(!missingPermission.committed);
});

test("SEC-04/2A.3: revoked session or blocked station after machine lock aborts", async () => {
  const revoked = fixture({ revokeAfterFirstRead: true });
  await deny(revoked.run(), "authentication_required", 401);
  assert(revoked.log.includes("lock-machine"));
  assert(!revoked.log.includes("domain-verify-and-transition"));
  assert(revoked.log.includes("transaction-rollback"));
  const blocked = fixture({ inactiveStationAfterLock: true });
  await deny(blocked.run(), "workstation_inactive");
  assert(!blocked.log.includes("domain-verify-and-transition"));
  assert(!blocked.committed);
});

test("SEC-04/2A.3: foreign machines and changed call states never trigger domain callbacks", async () => {
  const foreign = fixture({ foreignMachine: true });
  await deny(foreign.run(), "call_not_found", 404);
  assert(!foreign.log.includes("lock-machine"));
  const changed = fixture({ afterLockState: "in_progress" });
  await deny(changed.run(), "call_state_changed", 409);
  assert(changed.log.includes("lock-machine"));
  assert(!changed.log.includes("audit"));
});

test("SEC-04/2A.3: failed domain action never audits or commits", async () => {
  const f = fixture({ transitionThrows: true });
  await assert.rejects(f.run(), /technician PIN denied/);
  assert(!f.log.includes("audit"));
  assert(!f.committed);
  assert.deepEqual(f.staged, []);
});

test("SEC-04/2A.3: audit persistence failure rolls back successful domain transition", async () => {
  const f = fixture({ auditThrows: true });
  await assert.rejects(f.run(), /audit database write failed/);
  assert(f.log.includes("domain-verify-and-transition"));
  assert(f.log.includes("audit"));
  assert(f.log.includes("transaction-rollback"));
  assert(!f.committed);
  assert.deepEqual(f.staged, []);
});

test("SEC-04/2A.3: unverified technician result aborts, without audit or commit", async () => {
  const f = fixture();
  await deny(f.run({ verifyAndApplyAttendance: async () => ({
    value: "irrelevant", technicianId: " ",
  }) }), "verified_technician_required");
  assert(!f.log.includes("audit"));
  assert(!f.committed);
});
