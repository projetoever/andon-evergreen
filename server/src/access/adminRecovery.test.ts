import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient, Prisma } from "@prisma/client";
import { AccessError } from "./policy.js";
import { hashAccessPassword, tokenHash, verifyAccessPassword } from "./credentials.js";
import { issueCentralAdminRecoveryCode, recoverCentralAdmin } from "./adminRecovery.js";

const TOKEN = "d".repeat(64);
const REQUEST = { token: TOKEN, workstationId: "ws-37" };
const OLD_PASSWORD = "Old Admin Password#2026";
const NEW_PASSWORD = "New Admin Password#2026";

function fixture(initialHash: string) {
  const log: string[] = [];
  const now = new Date();
  let recoveryCodeHash: string | null = null;
  let adminPasswordHash = initialHash;
  let issuedAt: Date | null = null;
  let version = 1;
  let revokedAt: Date | null = null;
  let auditFails = false;
  let commits = 0;
  let codeUses = 0;
  let issued = 0;
  const audits: Record<string, unknown>[] = [];
  const tx = {
    accessSession: {
      findUnique: async (arg: { where: { tokenHash: string } }) => {
        assert.equal(arg.where.tokenHash, tokenHash(TOKEN));
        log.push("session-read");
        return {
          id: "session-37", userId: "admin-37", workstationId: "ws-37",
          purpose: "normal", authorizationVersion: 1, createdAt: now,
          lastInteractionAt: now, expiresAt: new Date(now.getTime() + 3_600_000),
          revokedAt, lastAuthenticatedAt: null,
          workstation: { active: true, pendingApproval: false },
          user: {
            id: "admin-37", login: "admin", displayName: "Admin", roleLabel: "Admin",
            active: true, accountType: "person", isPrimaryAdmin: true,
            mustChangePassword: false, authorizationVersion: 1,
            machineScope: "all", machines: [], permissions: [],
          },
        };
      },
      updateMany: async (arg: { where: Record<string, unknown>; data: { revokedAt: Date } }) => {
        log.push("revoke-sessions");
        assert.equal(arg.where.userId, "admin-37");
        revokedAt = arg.data.revokedAt;
        return { count: 1 };
      },
    },
    accessUser: {
      findFirst: async () => ({ id: "admin-37" }),
      findUnique: async () => ({
        id: "admin-37", isPrimaryAdmin: true, active: true, accountType: "person",
        passwordHash: adminPasswordHash, adminRecoveryCodeHash: recoveryCodeHash,
      }),
      updateMany: async (arg: {
        where: Record<string, unknown>; data: Record<string, unknown>;
      }) => {
        assert.equal(arg.where.id, "admin-37");
        if (arg.data.adminRecoveryCodeHash === null) {
          log.push("consume-code");
          if (!recoveryCodeHash || arg.where.adminRecoveryCodeHash !== recoveryCodeHash ||
              arg.where.passwordHash !== adminPasswordHash) return { count: 0 };
          adminPasswordHash = arg.data.passwordHash as string;
          recoveryCodeHash = null;
          version += 1;
          codeUses += 1;
          return { count: 1 };
        }
        log.push("issue-code");
        recoveryCodeHash = arg.data.adminRecoveryCodeHash as string;
        issuedAt = arg.data.adminRecoveryCodeIssuedAt as Date;
        issued += 1;
        return { count: 1 };
      },
    },
    auditEvent: { create: async (arg: { data: Record<string, unknown> }) => {
      log.push("audit");
      if (auditFails) throw Error("audit_failed");
      assert(!Object.hasOwn(arg.data, "recoveryCode"));
      assert(!Object.hasOwn(arg.data, "newPassword"));
      audits.push(arg.data);
      return { id: "audit" };
    } },
    $queryRaw: async () => { log.push("user-lock"); return [{ ok: true }]; },
  } as unknown as Prisma.TransactionClient;
  const db = {
    accessSession: tx.accessSession,
    $transaction: async (callback: (ctx: Prisma.TransactionClient) => Promise<unknown>) => {
      log.push("begin");
      try {
        const value = await callback(tx);
        commits += 1;
        log.push("commit");
        return value;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return {
    db, log,
    get codeHash() { return recoveryCodeHash; },
    get passwordHash() { return adminPasswordHash; },
    get issuedAt() { return issuedAt; },
    get commits() { return commits; },
    get codeUses() { return codeUses; },
    get issued() { return issued; },
    get audits() { return audits; },
    set auditFails(value: boolean) { auditFails = value; },
  };
}

test("S1/5: only primary Admin step-up can issue a new 128-bit offline recovery code", async () => {
  const fixtureDb = fixture(await hashAccessPassword(OLD_PASSWORD));
  const result = await issueCentralAdminRecoveryCode(fixtureDb.db, REQUEST, { ipAddress: "127.0.0.1", requestId: "req-r10-06" });
  assert.match(result.recoveryCode, /^HUB-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  assert(fixtureDb.issuedAt instanceof Date);
  assert.equal(result.issuedAt.toISOString(), fixtureDb.issuedAt.toISOString());
  const issuanceAudit = fixtureDb.audits.at(-1)!;
  assert.equal(issuanceAudit.action, "access.admin.recovery_code.issued");
  assert.equal(issuanceAudit.ipAddress, "127.0.0.1");
  assert.equal(issuanceAudit.requestId, "req-r10-06");
  assert.deepEqual(issuanceAudit.after, { issuedAt: result.issuedAt.toISOString() });
  assert(!JSON.stringify(issuanceAudit).includes(result.recoveryCode));
  assert(!JSON.stringify(issuanceAudit).includes(fixtureDb.codeHash!));
  const code = result.recoveryCode.replace(/^HUB-/, "").replaceAll("-", "");
  assert.equal(await verifyAccessPassword(code, fixtureDb.codeHash!), true);
  assert.deepEqual(fixtureDb.log.slice(-4), [
    "session-read", "issue-code", "audit", "commit",
  ]);
  assert.equal(fixtureDb.issued, 1);
});

test("S1/5: local recovery consumes code once, revokes Admin sessions and never issues a token", async () => {
  const f = fixture(await hashAccessPassword(OLD_PASSWORD));
  const issued = await issueCentralAdminRecoveryCode(f.db, REQUEST);
  const result = await recoverCentralAdmin(f.db, {
    recoveryCode: issued.recoveryCode, newPassword: NEW_PASSWORD,
  }, { workstationId: "ws-37", ipAddress: "127.0.0.1", requestId: "req-recover" });
  assert.deepEqual(result, { ok: true });
  assert.equal(await verifyAccessPassword(NEW_PASSWORD, f.passwordHash), true);
  assert.equal(f.codeHash, null);
  assert.equal(f.codeUses, 1);
  assert(f.log.includes("revoke-sessions"));
  await assert.rejects(recoverCentralAdmin(f.db, {
    recoveryCode: issued.recoveryCode, newPassword: "Next Admin Password#2026",
  }), (error) => error instanceof AccessError && error.code === "invalid_recovery_code");
  assert.equal(f.codeUses, 1);
});

test("S1/5: incorrect or malformed recovery cannot change Admin credentials", async () => {
  const f = fixture(await hashAccessPassword(OLD_PASSWORD));
  await issueCentralAdminRecoveryCode(f.db, REQUEST);
  for (const recoveryCode of ["wrong", "HUB-0000-0000-0000-0000-0000-0000-0000-0000"]) {
    await assert.rejects(recoverCentralAdmin(f.db, {
      recoveryCode, newPassword: NEW_PASSWORD,
    }), (error) => error instanceof AccessError && error.code === "invalid_recovery_code");
  }
  assert.equal(await verifyAccessPassword(OLD_PASSWORD, f.passwordHash), true);
  assert.equal(f.codeUses, 0);
});

test("S1/5: audit failure denies recovery rather than reporting success", async () => {
  const f = fixture(await hashAccessPassword(OLD_PASSWORD));
  const { recoveryCode } = await issueCentralAdminRecoveryCode(f.db, REQUEST);
  f.auditFails = true;
  await assert.rejects(recoverCentralAdmin(f.db, { recoveryCode, newPassword: NEW_PASSWORD }), /audit_failed/);
  assert.equal(f.log.at(-1), "rollback");
});
