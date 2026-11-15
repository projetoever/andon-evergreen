import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { issueSession, resolveSession, permitsPersistentOperationalAccount } from "./sessions.js";
import { tokenHash } from "./credentials.js";
import { AccessError } from "./policy.js";

const at = new Date("2026-11-15T12:00:00.000Z");
const station = { active: true, pendingApproval: false,
  allowPersistentOperationalLogin: true, lockedMachineId: "37" };

function reader({ policy, expiry, idleAt, permissions, persistent = false, revoked = false,
  scope = "selected", allowedMachineIds = ["37"], pinned = "37" }: {
  policy: string; expiry: Date; idleAt: Date; permissions: string[];
  persistent?: boolean; revoked?: boolean; scope?: string;
  allowedMachineIds?: string[]; pinned?: string | null;
}) {
  const token = "c".repeat(64);
  const record = {
    id: "session-37", userId: "user-37", workstationId: "ws-37",
    purpose: "normal", tokenHash: tokenHash(token),
    createdAt: new Date("2026-11-13T10:00:00.000Z"),
    lastInteractionAt: idleAt, expiresAt: expiry,
    persistentOperational: persistent,
    persistentMachineId: persistent ? "37" : null,
    revokedAt: revoked ? new Date("2026-11-14T10:00:00.000Z") : null,
    authorizationVersion: 5, workstation: { ...station, lockedMachineId: pinned },
    user: {
      id: "user-37", login: "operador", displayName: "Operador",
      roleLabel: "Produção", active: true, isPrimaryAdmin: false,
      accountType: "person", sessionPolicy: policy, mustChangePassword: false,
      authorizationVersion: 5, machineScope: scope,
      machines: allowedMachineIds.map(machineId => ({ machineId })),
      permissions: permissions.map(key => ({ key })),
    },
  };
  const db = { accessSession: { findUnique: async () => record } } as unknown as Pick<Prisma.TransactionClient, "accessSession">;
  return { db, request: { workstationId: "ws-37", token } };
}

test("SEC21: 24-hour session survives inactivity but stops at its absolute deadline", async () => {
  const args = reader({
    policy: "daily",
    expiry: new Date("2026-11-15T12:01:00.000Z"),
    idleAt: new Date("2026-11-14T00:00:00.000Z"),
    permissions: ["andon.read", "calls.open", "calls.finish"],
  });
  const principal = await resolveSession(args.db, args.request, at);
  assert.equal(principal.sessionPolicy, "daily");
  assert.deepEqual(principal.permissions, ["andon.read", "calls.open", "calls.finish"]);
  assert.equal(principal.persistentOperational, false);
  await assert.rejects(resolveSession(args.db, args.request,
    new Date("2026-11-15T12:01:00.000Z")), (e: unknown) =>
    e instanceof AccessError && e.statusCode === 401);
});

test("SEC21: standard inactivity still expires and daily cannot rescue revoked cookies", async () => {
  const base = { expiry: new Date("2026-11-15T13:00:00.000Z"),
    idleAt: new Date("2026-11-14T00:00:00.000Z"),
    permissions: ["andon.read"] };
  const normal = reader({ ...base, policy: "standard" });
  await assert.rejects(resolveSession(normal.db, normal.request, at), (e: unknown) =>
    e instanceof AccessError && e.statusCode === 401);
  const revoked = reader({ ...base, policy: "daily", revoked: true });
  await assert.rejects(resolveSession(revoked.db, revoked.request, at), (e: unknown) =>
    e instanceof AccessError && e.statusCode === 401);
});

test("SEC21: session issuance stores exact 12/24-hour deadlines and never silently extends daily", async () => {
  const created: Array<{ expiresAt: Date; persistentOperational: boolean }> = [];
  const tx = { accessSession: { create: async ({ data }: {
    data: { expiresAt: Date; persistentOperational: boolean };
  }) => {
    created.push(data);
    return { ...data, id: "session-new" };
  } } } as unknown as Prisma.TransactionClient;
  const user = { id: "user-37", authorizationVersion: 5 };
  for (const policy of ["standard", "daily", "persistent"]) {
    await issueSession(tx, user, "ws-37", "normal", at, policy === "persistent",
      policy === "persistent" ? "37" : null, policy);
  }
  assert.equal(created[0].expiresAt.getTime() - at.getTime(), 12 * 60 * 60_000);
  assert.equal(created[1].expiresAt.getTime() - at.getTime(), 24 * 60 * 60_000);
  assert.equal(created[2].persistentOperational, true);
  assert.equal(created[2].expiresAt.getUTCFullYear(), 9999);
});

test("SEC21: approved trusted sessions retain admin-selected grants independently of screen pin", async () => {
  const grants = ["andon.read", "calls.open", "catalog.assets.manage", "andon.settings.open"];
  const args = reader({
    policy: "persistent", expiry: new Date("2026-01-01T00:00:00.000Z"),
    idleAt: new Date("2026-01-01T00:00:00.000Z"), permissions: grants, persistent: true,
  });
  assert.equal(permitsPersistentOperationalAccount({
    accountType: "person", sessionPolicy: "persistent", isPrimaryAdmin: false,
    mustChangePassword: false, permissions: grants.map(key => ({ key })),
  }, station, [{ machineId: "37" }], "selected"), true);
  const principal = await resolveSession(args.db, args.request, at);
  assert.deepEqual(principal.permissions, grants);
  assert.deepEqual(principal.machineIds, ["37"]);
  assert.equal(principal.machineScope, "selected");
});

test("SEC-P0 permanent workstation session without screen pin retains real multi-machine ACL", async () => {
  const grants = ["andon.read", "calls.open", "history.read"];
  const args = reader({
    policy: "persistent", persistent: true, pinned: null, scope: "all",
    allowedMachineIds: ["37", "39"],
    expiry: new Date("2024-01-01T00:00:00.000Z"),
    idleAt: new Date("2024-01-01T00:00:00.000Z"),
    permissions: grants,
  });
  const principal = await resolveSession(args.db, args.request, at);
  assert.equal(principal.persistentOperational, true);
  assert.equal(principal.machineScope, "all");
  assert.deepEqual(principal.machineIds, ["37", "39"]);
  assert.deepEqual(principal.permissions, grants);
});
