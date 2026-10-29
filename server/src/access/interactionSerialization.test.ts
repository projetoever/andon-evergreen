import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { recordInteraction } from "./sessions.js";

const TOKEN = "d".repeat(64);
const request = { token: TOKEN, workstationId: "station-37" };
const startedAt = new Date();
type Case = {
  revokedAfterFirstRead?: boolean;
  expiredAfterFirstRead?: boolean;
  workstationMismatch?: boolean;
  updatedRows?: number;
};
function fixture(options: Case = {}) {
  const log: string[] = [];
  let commits = 0;
  let reads = 0;
  const tx = {
    accessSession: {
      findUnique: async (args: { where: { tokenHash: string } }) => {
        assert.equal(args.where.tokenHash, tokenHash(TOKEN));
        reads++;
        log.push("resolve-" + reads);
        return {
          id: "session-37", userId: "person-37",
          workstationId: options.workstationMismatch ? "station-39" : "station-37",
          revokedAt: options.revokedAfterFirstRead && reads > 1 ? startedAt : null,
          expiresAt: options.expiredAfterFirstRead && reads > 1
            ? new Date(0) : new Date(startedAt.getTime() + 3600_000),
          lastInteractionAt: startedAt,
          authorizationVersion: 7, purpose: "normal", createdAt: startedAt,
          workstation: { active: true, pendingApproval: false },
          user: {
            id: "person-37", login: "technician", displayName: "Technician",
            roleLabel: "Maintenance", accountType: "person",
            active: true, isPrimaryAdmin: false, mustChangePassword: false,
            authorizationVersion: 7, machineScope: "selected",
            machines: [{ machineId: "37" }],
            permissions: [{ key: "andon.read" }],
          },
        };
      },
      updateMany: async (input: {
        where: {
          id: string;
          revokedAt: null;
          expiresAt: { gt: Date };
          lastInteractionAt: { gt: Date };
        };
        data: { lastInteractionAt: Date };
      }) => {
        log.push("conditional-update");
        assert.equal(input.where.id, "session-37");
        assert.equal(input.where.revokedAt, null);
        assert(input.where.expiresAt.gt instanceof Date);
        assert(input.where.lastInteractionAt.gt instanceof Date);
        assert(input.where.expiresAt.gt.getTime() <= input.data.lastInteractionAt.getTime());
        assert.equal(
          input.data.lastInteractionAt.getTime() - input.where.lastInteractionAt.gt.getTime(),
          30 * 60 * 1000,
        );
        return { count: options.updatedRows ?? 1 };
      },
    },
    $queryRaw: async () => {
      log.push("user-lock");
      return [{ lockResult: "" }];
    },
  } as unknown as Prisma.TransactionClient;
  const db = {
    $transaction: async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      log.push("transaction-begin");
      try {
        const value = await callback(tx);
        commits++;
        log.push("commit");
        return value;
      } catch (error) {
        log.push("rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return { db, log, get commits() { return commits; } };
}
async function denies(f: ReturnType<typeof fixture>, req = request) {
  await assert.rejects(recordInteraction(f.db, req), (error: unknown) =>
    error instanceof AccessError && error.code === "authentication_required" &&
    error.statusCode === 401);
  assert.equal(f.commits, 0);
}

test("SEC-04/2A.5: explicit interaction locks user and validates session before conditional touch", async () => {
  const f = fixture();
  await recordInteraction(f.db, request);
  assert.deepEqual(f.log, [
    "transaction-begin", "resolve-1", "user-lock", "resolve-2",
    "conditional-update", "commit",
  ]);
  assert.equal(f.commits, 1);
});

test("SEC-04/2A.5: logout or administrative revocation while waiting for lock prevents touch", async () => {
  const f = fixture({ revokedAfterFirstRead: true });
  await denies(f);
  assert.deepEqual(f.log, [
    "transaction-begin", "resolve-1", "user-lock", "resolve-2", "rollback",
  ]);
});

test("SEC-04/2A.5: expired sessions cannot refresh after lock", async () => {
  const f = fixture({ expiredAfterFirstRead: true });
  await denies(f);
  assert(!f.log.includes("conditional-update"));
});

test("SEC-04/2A.5: workstation-wide revocation between validation and update is fail closed", async () => {
  const f = fixture({ updatedRows: 0 });
  await denies(f);
  assert(f.log.includes("conditional-update"));
  assert.deepEqual(f.log.slice(-2), ["conditional-update", "rollback"]);
});

test("SEC-04/2A.5: mismatched workstation and invalid token never obtain user lock", async () => {
  const wrongStation = fixture({ workstationMismatch: true });
  await denies(wrongStation);
  assert(!wrongStation.log.includes("user-lock"));
  const malformed = fixture();
  await denies(malformed, { token: "invalid", workstationId: "station-37" });
  assert(!malformed.log.includes("user-lock"));
});
