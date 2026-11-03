import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { assertRecentAdmin, reauthenticateAdmin, resolveSession } from "./sessions.js";
import { hashAccessPassword, tokenHash } from "./credentials.js";

const PASSWORD = "Pilot-Admin-Safe#2026";
const STORED_PASSWORD = hashAccessPassword(PASSWORD);
const TOKEN = "e".repeat(64);
const REQUEST = { token: TOKEN, workstationId: "ws-37" };

type Case = {
  isAdmin?: boolean;
  purpose?: string;
  revokedOnSecondRead?: boolean;
  changedPasswordAfterLock?: boolean;
  updateCount?: number;
  auditFailure?: boolean;
};
function fixture(storedHash: string, options: Case = {}) {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 10 * 60_000);
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60_000);
  const lastInteractionAt = new Date(now.getTime() - 30_000);
  const actions: string[] = [];
  let reads = 0;
  let committed = false;
  let lastAuthenticatedAt: Date | null = null;
  let changedPassword = false;

  const account = {
    findUnique: async () => {
      actions.push("account-read");
      if (changedPassword) return { passwordHash: "changed-hash-after-lock" };
      return { passwordHash: storedHash };
    },
    findUniqueOrThrow: async () => {
      actions.push("account-read-under-lock");
      return { passwordHash: options.changedPasswordAfterLock
        ? "changed-hash-after-lock" : storedHash };
    },
  };
  const session = {
    findUnique: async (args: { where: { tokenHash: string } }) => {
      assert.equal(args.where.tokenHash, tokenHash(TOKEN));
      reads++;
      actions.push("session-read-" + reads);
      return {
        id: "session-37", userId: "user-admin-37", workstationId: "ws-37",
        authorizationVersion: 1, purpose: options.purpose ?? "normal",
        createdAt, lastInteractionAt, lastAuthenticatedAt, expiresAt,
        revokedAt: options.revokedOnSecondRead && reads >= 2 ? now : null,
        user: {
          id: "user-admin-37", login: "admin", displayName: "Admin",
          roleLabel: "Admin", accountType: "person", active: true,
          isPrimaryAdmin: options.isAdmin ?? true, mustChangePassword: false,
          authorizationVersion: 1, machineScope: "all", machines: [], permissions: [],
        },
        workstation: { active: true, pendingApproval: false },
      };
    },
    updateMany: async (input: {
      where: {
        id: string; userId: string; workstationId: string; revokedAt: null;
        expiresAt: { gt: Date }; lastInteractionAt: { gt: Date };
      };
      data: { lastAuthenticatedAt: Date };
    }) => {
      actions.push("conditional-update");
      assert.equal(input.where.id, "session-37");
      assert.equal(input.where.userId, "user-admin-37");
      assert.equal(input.where.workstationId, "ws-37");
      assert.equal(input.where.revokedAt, null);
      assert(input.where.expiresAt.gt < expiresAt);
      assert(input.where.lastInteractionAt.gt < lastInteractionAt);
      if (options.updateCount === 0) return { count: 0 };
      lastAuthenticatedAt = input.data.lastAuthenticatedAt;
      return { count: 1 };
    },
  };
  const tx = {
    accessSession: session,
    accessUser: account,
    $queryRaw: async () => { actions.push("lock-user"); return [{ ok: true }]; },
    auditEvent: { create: async (args: {
      data: { action: string; resourceId: string; actorUserId: string; password?: string };
    }) => {
      actions.push("audit");
      if (options.auditFailure) throw new Error("audit failed");
      assert.equal(args.data.action, "access.admin.reauthenticated");
      assert.equal(args.data.resourceId, "session-37");
      assert.equal(args.data.actorUserId, "user-admin-37");
      assert.equal(args.data.password, undefined);
      return { id: "audit-37" };
    } },
  } as unknown as Prisma.TransactionClient;
  const db = {
    accessSession: session, accessUser: account,
    $transaction: async (fn: (arg: Prisma.TransactionClient) => Promise<unknown>) => {
      actions.push("begin");
      try {
        const result = await fn(tx);
        committed = true;
        actions.push("commit");
        return result;
      } catch (error) {
        actions.push("rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return {
    db, actions, createdAt, expiresAt, lastInteractionAt,
    get lastAuthenticatedAt() { return lastAuthenticatedAt; },
    get committed() { return committed; },
    set changedPassword(value: boolean) { changedPassword = value; },
  };
}

function assertDenied(error: unknown, code: string) {
  return error instanceof AccessError && error.code === code;
}

test("S1/3 Admin step-up refreshes only recent proof, not the 12-hour session or token", async () => {
  const f = fixture(await STORED_PASSWORD);
  const before = await resolveSession(f.db, REQUEST);
  assert.throws(() => assertRecentAdmin(before), (e) => assertDenied(e, "reauthentication_required"));
  const result = await reauthenticateAdmin(f.db, REQUEST, PASSWORD);
  assert.deepEqual(result, { ok: true });
  assert(f.committed);
  assert(f.lastAuthenticatedAt instanceof Date);
  const after = await resolveSession(f.db, REQUEST);
  assert.doesNotThrow(() => assertRecentAdmin(after));
  assert.equal(after.sessionId, before.sessionId);
  assert.equal(after.workstationId, before.workstationId);
  assert.equal(f.createdAt.getTime(), before.authenticatedAt.getTime());
  assert.equal(f.expiresAt.getTime(), before.authenticatedAt.getTime() + 14 * 60 * 60_000
    ? 0 : f.expiresAt.getTime(), "session expiry must not be replaced");
  assert.deepEqual(f.actions.filter((action) => action === "conditional-update"), ["conditional-update"]);
  assert.deepEqual(f.actions.slice(-4), ["conditional-update", "audit", "commit", "session-read-4"]);
});

test("S1/3 incorrect password and non-Admin account never update recent proof", async () => {
  const hash = await STORED_PASSWORD;
  const invalid = fixture(hash);
  await assert.rejects(reauthenticateAdmin(invalid.db, REQUEST, "Bad-Password#2026"),
    (e) => assertDenied(e, "invalid_credentials"));
  assert.equal(invalid.committed, false);
  assert.equal(invalid.lastAuthenticatedAt, null);

  const nonAdmin = fixture(hash, { isAdmin: false });
  await assert.rejects(reauthenticateAdmin(nonAdmin.db, REQUEST, PASSWORD),
    (e) => assertDenied(e, "admin_required"));
  assert.equal(nonAdmin.committed, false);
});

test("S1/3 revocation, changed password and concurrent session invalidation fail closed", async () => {
  const hash = await STORED_PASSWORD;
  for (const [options, label] of [
    [{ revokedOnSecondRead: true }, "revocation"],
    [{ changedPasswordAfterLock: true }, "password rotation"],
    [{ updateCount: 0 }, "conditional update"],
  ] as const) {
    const f = fixture(hash, options);
    await assert.rejects(reauthenticateAdmin(f.db, REQUEST, PASSWORD),
      (e) => assertDenied(e, "authentication_required"), label);
    assert.equal(f.committed, false, label);
    assert(!f.actions.includes("audit"), label);
  }
});

test("S1/3 audit failure aborts reauthentication transaction", async () => {
  const f = fixture(await STORED_PASSWORD, { auditFailure: true });
  await assert.rejects(reauthenticateAdmin(f.db, REQUEST, PASSWORD), /audit failed/);
  assert.equal(f.committed, false);
  assert.deepEqual(f.actions.slice(-3), ["conditional-update", "audit", "rollback"]);
});
