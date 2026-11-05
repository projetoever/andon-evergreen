import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import { hashAccessPassword } from "./credentials.js";
import { login } from "./sessions.js";
import { mayAutoApprovePrimaryAdminStation as eligible } from "./primaryAdminWorkstationAdmission.js";

const admin = {
  id: "admin-01", login: "admin", displayName: "Primary Admin",
  roleLabel: "Admin", accountType: "person", active: true,
  isPrimaryAdmin: true, mustChangePassword: false,
  passwordHash: "", authorizationVersion: 1, machineScope: "all",
  permissions: [], machines: [],
};
const station = {
  id: "a".repeat(36), name: null,
  active: false, pendingApproval: true,
  admission: null as { status: string } | null,
};

test("R9.2: only the authenticated primary Admin of a pending, non-rejected station qualifies", () => {
  assert.equal(eligible(admin, station), true);
  for (const user of [
    { ...admin, isPrimaryAdmin: false },
    { ...admin, mustChangePassword: true },
    { ...admin, accountType: "kiosk" },
    { ...admin, active: false },
    { ...admin, machineScope: "selected" },
  ]) assert.equal(eligible(user, station), false);
  for (const ws of [
    { ...station, active: true, pendingApproval: false },
    { ...station, active: false, pendingApproval: false },
    { ...station, admission: { status: "rejected" } },
    { ...station, admission: { status: "approved" } },
  ]) assert.equal(eligible(admin, ws), false);
  assert.equal(eligible(admin, null), false);
  assert.equal(eligible(admin, { ...station, admission: { status: "pending" } }), true);
});

test("R9.2: correct Admin login atomically approves current pending station, revokes admission cookies and audits", async () => {
  const password = "Primary-Admin-Pilot#2026";
  const storedHash = await hashAccessPassword(password);
  const events: string[] = [];
  const auditActions: string[] = [];
  let approved = false;
  let purpose = "";
  const tx = {
    $queryRaw: async () => {
      events.push("lock");
      return [];
    },
    accessUser: {
      findUniqueOrThrow: async () => {
        events.push("read-current-user");
        return { ...admin, passwordHash: storedHash };
      },
    },
    workstation: {
      findUnique: async () => {
        events.push("read-station");
        return { ...station };
      },
      updateMany: async (args: {
        where: { id: string; active: boolean; pendingApproval: boolean };
        data: { active: boolean; pendingApproval: boolean; allowOperational: boolean };
      }) => {
        events.push("approve-current-station");
        assert.equal(args.where.id, station.id);
        assert.equal(args.where.active, false);
        assert.equal(args.where.pendingApproval, true);
        assert.equal(args.data.active, true);
        assert.equal(args.data.pendingApproval, false);
        assert.equal(args.data.allowOperational, true);
        approved = true;
        return { count: 1 };
      },
    },
    workstationAdmission: {
      upsert: async (args: { create: { workstationId: string; requesterUserId: string; status: string } }) => {
        events.push("record-station-approval");
        assert.equal(args.create.workstationId, station.id);
        assert.equal(args.create.requesterUserId, admin.id);
        assert.equal(args.create.status, "approved");
        return {};
      },
    },
    accessSession: {
      updateMany: async () => {
        events.push("revoke-old-admission-cookies");
        return { count: 1 };
      },
      create: async (args: { data: { purpose: string; workstationId: string } }) => {
        purpose = args.data.purpose;
        assert.equal(args.data.workstationId, station.id);
        events.push("issue-new-session");
        return { id: "new-session" };
      },
    },
    auditEvent: {
      create: async (args: { data: { action: string } }) => {
        auditActions.push(args.data.action);
        return { id: "audit" };
      },
    },
  };
  const db = {
    accessUser: { findUnique: async () => ({ ...admin, passwordHash: storedHash }) },
    $transaction: async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      run(tx as unknown as Prisma.TransactionClient),
  } as unknown as PrismaClient;
  const session = await login(db, {
    login: "admin", password, workstationId: station.id,
  }, { ipAddress: "127.0.0.1", requestId: "test-admin-auto-approval" });
  assert(approved);
  assert.equal(purpose, "normal");
  assert.equal(session?.purpose, "normal");
  assert.deepEqual(auditActions, [
    "workstation.admission.auto_approved_by_primary_admin", "access.login",
  ]);
  assert(events.indexOf("record-station-approval") < events.indexOf("issue-new-session"));
  assert(events.indexOf("revoke-old-admission-cookies") < events.indexOf("issue-new-session"));
  assert(events.indexOf("approve-current-station") < events.indexOf("issue-new-session"));
});
