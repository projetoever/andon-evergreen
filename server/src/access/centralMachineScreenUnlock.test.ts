import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hashAccessPassword } from "./credentials.js";
import { mayAuthorizeScreenUnlock, unlockCentralMachineScreen } from "./centralMachineScreenUnlock.js";
import { AccessError } from "./policy.js";

const ws = "ws_00000000-0000-4000-8000-000000000001";
const machine = "1";
const maint = {
  id: "maint-1", login: "vini", displayName: "Vinicius", roleLabel: "Manutenção",
  active: true, accountType: "person", mustChangePassword: false,
  isPrimaryAdmin: false, machineScope: "selected", passwordHash: "",
  permissions: [{ key: "andon.read" }, { key: "calls.attend" }],
  machines: [{ machineId: machine }],
};
const admin = { ...maint, id: "admin-1", login: "admin", roleLabel: "Admin",
  isPrimaryAdmin: true, machineScope: "all", machines: [], permissions: [] };

test("R9.3 screen release requires verified Admin or scoped maintenance; production and revoked accounts fail", () => {
  assert.equal(mayAuthorizeScreenUnlock(maint, machine), true);
  assert.equal(mayAuthorizeScreenUnlock(maint, "37"), false);
  assert.equal(mayAuthorizeScreenUnlock(admin, machine), true);
  assert.equal(mayAuthorizeScreenUnlock({ ...maint, active: false }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...maint, roleLabel: "Produção" }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...maint, accountType: "kiosk" }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...maint, mustChangePassword: true }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({
    ...maint, permissions: [{ key: "andon.read" }],
  }, machine), false);
});

test("R11: explicit screen-unlock permission delegates to scoped Production without granting Admin powers", () => {
  const delegated = {
    ...maint, roleLabel: "Produção",
    permissions: [{ key: "andon.read" }, { key: "workstations.screen.unlock" }],
  };
  assert.equal(mayAuthorizeScreenUnlock(delegated, machine), true);
  assert.equal(mayAuthorizeScreenUnlock(delegated, "37"), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...delegated, active: false }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...delegated, accountType: "kiosk" }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...delegated, mustChangePassword: true }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...delegated, permissions: [{ key: "andon.read" }] }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({
    ...delegated, permissions: [{ key: "workstations.screen.unlock" }],
  }, machine), false);
  assert.equal(mayAuthorizeScreenUnlock({ ...delegated, machineScope: "all", machines: [] }, "37"), true);
});

test("R9.3 unlocking fixed machine is atomic, audited and does not switch the operator session", async () => {
  const password = "Maintenance-Central-2026";
  const passHash = await hashAccessPassword(password);
  const candidate = { ...maint, passwordHash: passHash };
  const now = new Date();
  let locked = machine;
  const events: string[] = [];
  const row = {
    id: "session1", tokenHash: "hash", workstationId: ws,
    userId: "operator-1", authorizationVersion: 1,
    revokedAt: null, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 300000),
    createdAt: now, lastAuthenticatedAt: now, purpose: "normal",
    workstation: { id: ws, active: true, pendingApproval: false },
    user: {
      id: "operator-1", login: "operator", displayName: "Operator",
      active: true, authorizationVersion: 1,
      mustChangePassword: false, roleLabel: "Produção", accountType: "person",
      isPrimaryAdmin: false, machineScope: "selected",
      permissions: [{ key: "andon.read" }], machines: [{ machineId: machine }],
    },
  };
  const tx = {
    $queryRaw: async () => { events.push("lock"); return []; },
    accessUser: {
      findUnique: async () => ({ ...candidate }),
    },
    accessSession: {
      findUnique: async () => row,
    },
    workstation: {
      findUnique: async () => ({ active: true, pendingApproval: false, lockedMachineId: locked }),
      updateMany: async (args: {
        where: { id: string; lockedMachineId: string };
        data: { lockedMachineId: null };
      }) => {
        assert.equal(args.where.id, ws);
        assert.equal(args.where.lockedMachineId, machine);
        assert.equal(args.data.lockedMachineId, null);
        events.push("unlock");
        locked = "";
        return { count: 1 };
      },
    },
    auditEvent: {
      create: async (args: { data: { action: string; actorUserId: string; before: unknown; after: unknown } }) => {
        events.push("audit");
        assert.equal(args.data.action, "workstation.screen.unlock.credential_verified");
        assert.equal(args.data.actorUserId, "operator-1");
        assert.doesNotMatch(JSON.stringify(args.data), /Maintenance-Central-2026/);
        return { id: "audit1" };
      },
    },
  };
  const db = {
    accessUser: { findUnique: async () => candidate },
    accessSession: { findUnique: async () => row },
    $transaction: async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      fn(tx as unknown as Prisma.TransactionClient),
  } as unknown as PrismaClient;
  const input = { login: "vini", password, machineId: machine,
    workstationId: ws, token: "a".repeat(64), requestId: "test" };
  const result = await unlockCentralMachineScreen(db, input);
  assert.deepEqual(result, { ok: true, workstationId: ws, lockedMachineId: null });
  assert(events.indexOf("unlock") < events.indexOf("audit"));
  assert.equal(row.purpose, "normal");
  await assert.rejects(
    () => unlockCentralMachineScreen(db, input),
    (e: unknown) => e instanceof AccessError && e.code === "screen_lock_changed",
  );
});

test("R9.3 invalid central maintenance credentials never unlock a screen", async () => {
  const passHash = await hashAccessPassword("Valid-Credential-2026");
  let changes = 0;
  const db = {
    accessUser: { findUnique: async () => ({ ...maint, passwordHash: passHash }) },
    accessSession: { findUnique: async () => ({
      id: "session1", workstationId: ws, userId: "operator-1",
      authorizationVersion: 1, revokedAt: null,
      lastInteractionAt: new Date(), expiresAt: new Date(Date.now() + 300000),
      createdAt: new Date(), purpose: "normal",
      workstation: { active: true, pendingApproval: false },
      user: {
        id: "operator-1", login: "operator", displayName: "Operator",
        active: true, authorizationVersion: 1, mustChangePassword: false,
        roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
        machineScope: "selected", machines: [{ machineId: machine }],
        permissions: [{ key: "andon.read" }],
      },
    }) },
    $transaction: async () => { changes++; },
  } as unknown as PrismaClient;
  await assert.rejects(
    () => unlockCentralMachineScreen(db, {
      login: "vini", password: "Wrong-Credential-2026",
      machineId: machine, workstationId: ws, token: "a".repeat(64),
    }),
    (e: unknown) => e instanceof AccessError && e.code === "invalid_credentials",
  );
  assert.equal(changes, 0);
});
