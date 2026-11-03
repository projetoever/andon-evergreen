import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { deriveWorkstationPresence, recordWorkstationHeartbeat } from "./workstationPresence.js";

const TOKEN = "f".repeat(64);
const request = { token: TOKEN, workstationId: "ws-37" };

function fixture(options: {
  revokedAtSecondRead?: boolean;
  passwordChangePurpose?: boolean;
  workstationMismatch?: boolean;
  updatedRows?: number;
} = {}) {
  const actions: string[] = [];
  let reads = 0;
  let committed = false;
  const now = new Date();
  const tx = {
    accessSession: {
      findUnique: async (args: { where: { tokenHash: string } }) => {
        assert.equal(args.where.tokenHash, tokenHash(TOKEN));
        reads += 1;
        actions.push(`resolve-${reads}`);
        return {
          id: "session-37", userId: "user-37",
          workstationId: options.workstationMismatch ? "ws-42" : "ws-37",
          purpose: options.passwordChangePurpose ? "password_change" : "normal",
          createdAt: now, lastInteractionAt: now,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          revokedAt: options.revokedAtSecondRead && reads > 1 ? now : null,
          authorizationVersion: 1,
          workstation: { active: true, pendingApproval: false },
          user: {
            id: "user-37", login: "maint", displayName: "Maintenance", roleLabel: "Manutenção",
            accountType: "person", active: true, isPrimaryAdmin: false,
            mustChangePassword: false, authorizationVersion: 1,
            machineScope: "all", machines: [], permissions: [],
          },
        };
      },
      updateMany: () => { throw Error("heartbeat must never extend or revoke access session"); },
    },
    workstation: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        actions.push("presence-write");
        assert.deepEqual(args.where, { id: "ws-37", active: true, pendingApproval: false });
        assert.deepEqual(Object.keys(args.data), ["lastHeartbeatAt"]);
        assert(args.data.lastHeartbeatAt instanceof Date);
        return { count: options.updatedRows ?? 1 };
      },
    },
    $queryRaw: async () => { actions.push("user-lock"); return [{ ok: true }]; },
  } as unknown as Prisma.TransactionClient;
  const db = {
    $transaction: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      actions.push("begin");
      try {
        const value = await fn(tx);
        committed = true;
        actions.push("commit");
        return value;
      } catch (error) {
        actions.push("rollback");
        throw error;
      }
    },
  } as unknown as PrismaClient;
  return { db, actions, get committed() { return committed; } };
}

test("S5: online means recent heartbeat AND live approved central session, never historical contact", () => {
  const now = new Date("2026-11-03T18:00:00Z");
  const defaultState = { active: true, pendingApproval: false, hasValidCentralSession: true };
  const live = new Date(now.getTime() - 15_000);
  assert.equal(deriveWorkstationPresence({ ...defaultState, lastHeartbeatAt: null }, now), "unknown");
  assert.equal(deriveWorkstationPresence({ ...defaultState, lastHeartbeatAt: live }, now), "online");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: new Date(now.getTime() - 45_000),
  }, now), "online");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: new Date(now.getTime() - 45_001),
  }, now), "offline");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: new Date(now.getTime() + 1),
  }, now), "offline", "future timestamp is not proof of presence");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: live, active: false,
  }, now), "offline");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: live, pendingApproval: true,
  }, now), "offline");
  assert.equal(deriveWorkstationPresence({
    ...defaultState, lastHeartbeatAt: live, hasValidCentralSession: false,
  }, now), "offline");
});

test("S5: heartbeat locks user, revalidates session and writes only workstation timestamp", async () => {
  const f = fixture();
  assert.deepEqual(await recordWorkstationHeartbeat(f.db, request), { ok: true });
  assert(f.committed);
  assert.deepEqual(f.actions, ["begin", "resolve-1", "user-lock", "resolve-2", "presence-write", "commit"]);
});

test("S5: revoked session, password-change, mismatch or refused write cannot report online", async () => {
  for (const [opts, expected] of [
    [{ revokedAtSecondRead: true }, "authentication_required"],
    [{ passwordChangePurpose: true }, "authentication_required"],
    [{ workstationMismatch: true }, "authentication_required"],
    [{ updatedRows: 0 }, "workstation_denied"],
  ] as const) {
    const f = fixture(opts);
    await assert.rejects(recordWorkstationHeartbeat(f.db, request),
      (err) => err instanceof AccessError && err.code === expected);
    assert.equal(f.committed, false);
    assert.equal(f.actions.at(-1), "rollback");
  }
});
