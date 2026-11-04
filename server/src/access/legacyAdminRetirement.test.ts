import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { AccessError } from "./policy.js";
import { legacyAdminRetirementStatus, retireLegacyAdminPassword } from "./legacyAdminRetirement.js";

const previousCentralFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
test.before(() => { process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1"; });
test.after(() => {
  if (previousCentralFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousCentralFlag;
});
const TOKEN = "d".repeat(64);
const request = { token: TOKEN, workstationId: "ws-37" };
function fixture(opts: {
  legacyHash?: string | null;
  centralRecoveryHash?: string | null;
  primaryAdmin?: boolean;
  revokedAfterLock?: boolean;
  staleAuth?: boolean;
  mismatchOnUpdate?: boolean;
  auditFails?: boolean;
} = {}) {
  const flags = {
    legacyHash: opts.legacyHash === undefined ? "legacy-hash-not-a-password" : opts.legacyHash,
    centralRecoveryHash: opts.centralRecoveryHash === undefined ? "central-recovery-hash" : opts.centralRecoveryHash,
    primaryAdmin: opts.primaryAdmin ?? true,
    revokedAfterLock: opts.revokedAfterLock ?? false,
    staleAuth: opts.staleAuth ?? false,
    mismatchOnUpdate: opts.mismatchOnUpdate ?? false,
    auditFails: opts.auditFails ?? false,
  };
  const actions: string[] = [];
  let sessionReads = 0;
  let writes = 0;
  let committed = 0;
  const now = new Date();
  const tx = {
    accessSession: {
      findUnique: async (arg: { where: { tokenHash: string } }) => {
        assert.equal(arg.where.tokenHash, tokenHash(TOKEN));
        sessionReads++;
        actions.push("resolve-session");
        return {
          id: "session-37", userId: "admin-37", workstationId: "ws-37",
          purpose: "normal", authorizationVersion: 1, createdAt: now,
          lastInteractionAt: now,
          lastAuthenticatedAt: flags.staleAuth ? new Date(now.getTime() - 6 * 60_000) : now,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          revokedAt: flags.revokedAfterLock && sessionReads > 1 ? now : null,
          workstation: { active: true, pendingApproval: false },
          user: {
            id: "admin-37", login: "admin", displayName: "Admin",
            roleLabel: "Admin", accountType: "person", active: true,
            isPrimaryAdmin: flags.primaryAdmin, machineScope: "all",
            authorizationVersion: 1, mustChangePassword: false,
            permissions: [], machines: [],
          },
        };
      },
    },
    $queryRaw: async () => {
      actions.push("lock-settings-or-user");
      return [{ id: "global" }];
    },
    systemSettings: {
      findUnique: async () => {
        actions.push("read-global");
        return {
          adminPasswordHash: flags.legacyHash,
          adminRecoveryCodeHash: "legacy-recovery-hash",
          adminRecoveryCodeIssuedAt: now,
        };
      },
      updateMany: async (arg: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        actions.push("retire-global");
        assert.deepEqual(arg.where, { id: "global", adminPasswordHash: "legacy-hash-not-a-password" });
        assert.deepEqual(arg.data, {
          adminPasswordHash: null, adminRecoveryCodeHash: null, adminRecoveryCodeIssuedAt: null,
        });
        if (flags.mismatchOnUpdate) return { count: 0 };
        flags.legacyHash = null;
        writes++;
        return { count: 1 };
      },
    },
    accessUser: {
      findUnique: async () => {
        actions.push("read-admin");
        return {
          isPrimaryAdmin: flags.primaryAdmin,
          active: true, accountType: "person",
          adminRecoveryCodeHash: flags.centralRecoveryHash,
        };
      },
    },
    auditEvent: {
      create: async (arg: { data: Record<string, unknown> }) => {
        actions.push("append-audit");
        if (flags.auditFails) throw new Error("audit_failed");
        assert.equal(arg.data.action, "access.admin.legacy_credential.retired");
        assert.equal(arg.data.resourceId, "global");
        const serialized = JSON.stringify(arg.data);
        assert(!serialized.includes("legacy-hash-not-a-password"));
        assert(!serialized.includes("central-recovery-hash"));
        return { id: "audit-1" };
      },
    },
  } as unknown as Prisma.TransactionClient;
  const db = {
    accessSession: tx.accessSession,
    systemSettings: tx.systemSettings,
    accessUser: tx.accessUser,
    $transaction: async (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => {
      actions.push("begin");
      try {
        const result = await fn(tx);
        committed++;
        actions.push("commit");
        return result;
      } catch (e) {
        actions.push("rollback");
        throw e;
      }
    },
  } as unknown as PrismaClient;
  return {
    db, actions, flags,
    get writes() { return writes; },
    get committed() { return committed; },
  };
}

test("S1/7 status is read-only and returns only credential readiness booleans", async () => {
  const f = fixture();
  assert.deepEqual(await legacyAdminRetirementStatus(f.db, request), {
    legacyPasswordPresent: true, centralRecoveryConfigured: true,
  });
  assert.equal(f.writes, 0);
  assert.equal(f.committed, 0);
  assert(!f.actions.includes("append-audit"));
});

test("S1/7 explicit retirement atomically clears both legacy secrets and audits without minting session", async () => {
  const f = fixture();
  assert.deepEqual(await retireLegacyAdminPassword(f.db, request, true), {
    ok: true, legacyPasswordPresent: false,
  });
  assert.equal(f.writes, 1);
  assert.equal(f.committed, 1);
  assert(f.actions.indexOf("lock-settings-or-user") < f.actions.indexOf("retire-global"));
  assert(f.actions.includes("append-audit"));
  assert(!f.actions.includes("issue-session"));
});

test("S1/7 fail closed without confirmation, recent Admin, or offline central recovery code", async () => {
  for (const [opts, confirm, expected] of [
    [{}, false, "retirement_confirmation_required"],
    [{ primaryAdmin: false }, true, "admin_required"],
    [{ staleAuth: true }, true, "reauthentication_required"],
    [{ centralRecoveryHash: null }, true, "central_recovery_required"],
    [{ legacyHash: null }, true, "legacy_admin_already_retired"],
    [{ mismatchOnUpdate: true }, true, "legacy_admin_already_retired"],
    [{ revokedAfterLock: true }, true, "authentication_required"],
  ] as const) {
    const f = fixture(opts);
    await assert.rejects(
      retireLegacyAdminPassword(f.db, request, confirm),
      (err) => err instanceof AccessError && err.code === expected,
      expected,
    );
    assert.equal(f.committed, 0, expected);
    assert.equal(f.writes, 0, expected);
  }
});

test("S1/7 a failed audit causes the transaction to reject, never reports retirement success", async () => {
  const f = fixture({ auditFails: true });
  await assert.rejects(retireLegacyAdminPassword(f.db, request, true), /audit_failed/);
  assert.equal(f.committed, 0);
  assert.equal(f.actions.at(-1), "rollback");
});

test("S1/7 central OFF must not allow even an authenticated central Admin to retire an industrial password", async () => {
  const previous = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  try {
    const f = fixture();
    await assert.rejects(
      legacyAdminRetirementStatus(f.db, request),
      (error) => error instanceof AccessError && error.code === "central_mode_required",
    );
    await assert.rejects(
      retireLegacyAdminPassword(f.db, request, true),
      (error) => error instanceof AccessError && error.code === "central_mode_required",
    );
    assert.equal(f.committed, 0);
    assert.equal(f.writes, 0);
    assert.deepEqual(f.actions, []);
  } finally {
    if (previous === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previous;
  }
});
