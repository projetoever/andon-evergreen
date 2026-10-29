import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { logout } from "./sessions.js";

const TOKEN = "c".repeat(64);
const request = { token: TOKEN, workstationId: "ws-37" };
const now = new Date();
function fixture(opts: {
  revokeAfterFirstRead?: boolean;
  updateCount?: number;
  auditFailure?: boolean;
} = {}) {
  const log: string[] = [];
  let reads = 0;
  let committed = false;
  const db = {
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      log.push("begin");
      try {
        const value = await callback({
          accessSession: {
            findUnique: async (args: { where: { tokenHash: string } }) => {
              assert.equal(args.where.tokenHash, tokenHash(TOKEN));
              reads++;
              log.push("resolve-" + reads);
              return {
                id: "session-37",
                userId: "user-37",
                workstationId: "ws-37",
                purpose: "normal",
                authorizationVersion: 2,
                createdAt: now,
                lastInteractionAt: now,
                expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
                revokedAt: opts.revokeAfterFirstRead && reads > 1 ? now : null,
                user: {
                  id: "user-37", login: "tech", displayName: "Maintenance",
                  roleLabel: "Technician", accountType: "person",
                  active: true, isPrimaryAdmin: false, mustChangePassword: false,
                  authorizationVersion: 2, machineScope: "selected",
                  machines: [{ machineId: "37" }], permissions: [],
                },
                workstation: { active: true, pendingApproval: false },
              };
            },
            updateMany: async (args: { where: { id: string; revokedAt: null } }) => {
              log.push("revoke");
              assert.deepEqual(args.where, { id: "session-37", revokedAt: null });
              return { count: opts.updateCount ?? 1 };
            },
          },
          $queryRaw: async () => {
            log.push("user-lock");
            return [{ lockResult: "" }];
          },
          auditEvent: {
            create: async (args: { data: Record<string, unknown> }) => {
              log.push("audit");
              if (opts.auditFailure) throw new Error("audit write failed");
              assert.equal(args.data.action, "access.logout");
              assert.equal(args.data.resourceId, "session-37");
              assert.equal(args.data.actorUserId, "user-37");
              return { id: "audit-37" };
            },
          },
        } as unknown as Prisma.TransactionClient);
        committed = true;
        log.push("commit");
        return value;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return { db, log, get committed() { return committed; } };
}
async function denies(f: ReturnType<typeof fixture>) {
  await assert.rejects(logout(f.db, request), (error: unknown) =>
    error instanceof AccessError && error.code === "authentication_required" &&
    error.statusCode === 401);
  assert(!f.committed);
}

test("SEC-04/2A.4: logout locks user, revalidates session then revokes and audits atomically", async () => {
  const f = fixture();
  await logout(f.db, request);
  assert.deepEqual(f.log, [
    "begin", "resolve-1", "user-lock", "resolve-2",
    "revoke", "audit", "commit",
  ]);
  assert(f.committed);
});

test("SEC-04/2A.4: concurrent session revocation denies logout after user lock", async () => {
  const f = fixture({ revokeAfterFirstRead: true });
  await denies(f);
  assert.deepEqual(f.log, ["begin", "resolve-1", "user-lock", "resolve-2", "rollback"]);
});

test("SEC-04/2A.4: conditional revoke must change exactly one live session", async () => {
  const f = fixture({ updateCount: 0 });
  await denies(f);
  assert(f.log.includes("revoke"));
  assert(!f.log.includes("audit"));
});

test("SEC-04/2A.4: audit failure rejects transaction, not a silent successful logout", async () => {
  const f = fixture({ auditFailure: true });
  await assert.rejects(logout(f.db, request), /audit write failed/);
  assert.deepEqual(f.log.slice(-3), ["revoke", "audit", "rollback"]);
  assert(!f.committed);
});
