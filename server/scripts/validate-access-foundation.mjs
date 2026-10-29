import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashAccessPassword, tokenHash } from "../dist/access/credentials.js";
import {
  login,
  resolveSession,
  changePassword,
  resetPassword,
  revokeUserSessions,
  recordInteraction,
} from "../dist/access/sessions.js";
import { assertPermission } from "../dist/access/policy.js";
import { auditedMutation } from "../dist/access/audit.js";
if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
) {
  throw Error("Use ANDON_INTEGRATION_TEST=1 and isolated andon_test database");
}
const db = new PrismaClient();
const otherProcess = new PrismaClient();
let adminId;
const suffix = randomUUID().replaceAll("-", "");
try {
  const workstationId = `ws_${randomUUID()}`;
  await db.workstation.create({
    data: { id: workstationId, active: true, pendingApproval: false },
  });
  const password = "Stage two valid passphrase";
  const passwordHash = await hashAccessPassword(password);
  const machine = await db.machine.create({
    data: { id: `access-${suffix}`, name: "Access test" },
  });
  // Fixture provisioning only. No production provisioning endpoint exists in task 2.
  const admin = await db.accessUser.create({
    data: {
      login: `admin.${suffix}`,
      displayName: "Test Admin",
      roleLabel: "Admin",
      isPrimaryAdmin: true,
      machineScope: "all",
      passwordHash,
      mustChangePassword: false,
    },
  });
  adminId = admin.id;
  const user = await db.accessUser.create({
    data: {
      login: `leader.${suffix}`,
      displayName: "Test Leader",
      roleLabel: "Líder",
      passwordHash,
      mustChangePassword: true,
      temporaryExpiresAt: new Date(Date.now() + 86400000),
      permissions: { create: { key: "calls.open" } },
      machines: { create: { machineId: machine.id } },
    },
  });
  const provisional = await login(db, { login: user.login, password, workstationId });
  assert.equal(provisional.purpose, "password_change");
  assert.throws(() =>
    assertPermission(
      { ...user, userId: user.id, purpose: provisional.purpose },
      "calls.open",
      machine.id,
    ),
  );
  await assert.rejects(login(db, { login: user.login, password, workstationId }));
  const changed = await changePassword(
    db,
    { token: provisional.token, workstationId },
    "The leader personal password",
  );
  await assert.rejects(resolveSession(db, { token: provisional.token, workstationId }));
  const req = { token: changed.token, workstationId };
  const principal = await resolveSession(otherProcess, req); // Persistent across client/process instances.
  assertPermission(principal, "calls.open", machine.id);
  // Real PostgreSQL regression: a valid interaction updates only an active session.
  const interactionBaseline = new Date(Date.now() - 60_000);
  await db.accessSession.update({
    where: { id: changed.sessionId },
    data: { lastInteractionAt: interactionBaseline },
  });
  await recordInteraction(otherProcess, req);
  const interacted = await db.accessSession.findUniqueOrThrow({
    where: { id: changed.sessionId },
  });
  assert(interacted.lastInteractionAt > interactionBaseline);
  assert.throws(() => assertPermission(principal, "calls.open", "unapproved-machine"));
  assert.throws(() => assertPermission(principal, "users.create"));
  await assert.rejects(changePassword(db, req, "Another personal password"));
  await db.accessSession.update({
    where: { id: changed.sessionId },
    data: {
      createdAt: new Date(Date.now() - 3600000),
      lastInteractionAt: new Date(Date.now() - 31 * 60000),
    },
  });
  await assert.rejects(resolveSession(db, req));
  await assert.rejects(recordInteraction(otherProcess, req));
  await db.accessSession.update({
    where: { id: changed.sessionId },
    data: { lastInteractionAt: new Date() },
  });
  await db.accessUser.update({ where: { id: user.id }, data: { active: false } });
  await assert.rejects(resolveSession(db, req));
  await db.accessUser.update({ where: { id: user.id }, data: { active: true } });
  await assert.rejects(resolveSession(db, { ...req, workstationId: `ws_${randomUUID()}` }));
  const adminSession = await login(db, { login: admin.login, password, workstationId });
  const adminReq = { token: adminSession.token, workstationId };
  await assert.rejects(resetPassword(db, req, admin.id, "unauthorized reset"));
  const reset = await resetPassword(db, adminReq, user.id, "Test reset");
  await assert.rejects(resolveSession(otherProcess, req));
  const results = await Promise.allSettled([
    login(db, { login: user.login, password: reset.temporaryPassword, workstationId }),
    login(db, { login: user.login, password: reset.temporaryPassword, workstationId }),
  ]);
  assert.equal(
    results.filter((r) => r.status === "fulfilled").length,
    1,
    "temporary password must have a single winner",
  );
  const winner = results.find((r) => r.status === "fulfilled").value;
  await db.accessSession.update({
    where: { id: winner.sessionId },
    data: {
      createdAt: new Date(Date.now() - 3600000),
      lastInteractionAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await assert.rejects(resolveSession(db, { token: winner.token, workstationId }));
  const before = await db.accessUser.findUniqueOrThrow({ where: { id: user.id } });
  await assert.rejects(
    auditedMutation(
      db,
      { actorType: "service" },
      { action: "test.rollback", resourceType: "access_user", result: "invalid" },
      (tx) =>
        tx.accessUser.update({ where: { id: user.id }, data: { roleLabel: "MUST ROLLBACK" } }),
    ),
  );
  assert.equal(
    (await db.accessUser.findUniqueOrThrow({ where: { id: user.id } })).roleLabel,
    before.roleLabel,
  );
  await db.workstation.update({ where: { id: workstationId }, data: { active: false } });
  await assert.rejects(resolveSession(db, adminReq));
  await db.workstation.update({ where: { id: workstationId }, data: { active: true } });
  await revokeUserSessions(db, adminReq, admin.id, "Test revocation");
  await assert.rejects(resolveSession(otherProcess, adminReq));
  await assert.rejects(recordInteraction(otherProcess, adminReq));
  const audit = await db.auditEvent.findMany({ where: { workstationId } });
  const serialized = JSON.stringify(audit);
  for (const secret of [
    password,
    passwordHash,
    reset.temporaryPassword,
    changed.token,
    tokenHash(changed.token),
  ])
    assert.equal(serialized.includes(secret), false);
  assert(audit.some((row) => row.action === "access.password.reset"));
  await assert.rejects(
    db.auditEvent.update({ where: { id: audit[0].id }, data: { reason: "tamper" } }),
  );
  await assert.rejects(db.auditEvent.delete({ where: { id: audit[0].id } }));
  // Do not delete durable events as cleanup. Fixtures live only in the isolated test DB.
  console.log(
    "Access foundation integration: PASS (single-use race, scope, persistence, expiry, reset, revocation, rollback and append-only audit)",
  );
} finally {
  if (adminId)
    await db.accessUser.update({
      where: { id: adminId },
      data: { isPrimaryAdmin: false, active: false },
    });
  await db.$disconnect();
  await otherProcess.$disconnect();
}
