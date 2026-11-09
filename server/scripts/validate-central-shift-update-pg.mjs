import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerShiftRoutes } from "../dist/routes/shifts.js";
import { updateCentralShift } from "../dist/access/centralShiftSettingsUpdate.js";

// The database must be the disposable CI database and flags initially OFF.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED === "1")
  throw Error("R12-04B requires isolated /andon_test and both central flags initially OFF");

const db = new PrismaClient();
const concurrent = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const shiftIds = [0, 1].map(i => "ci04b-shift-" + i + "-" + suffix);
const originals = [0, 1].map(i => "CI Shift " + i + " " + suffix);
const machineId = "ci04b-machine-" + suffix;
const stationIds = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [], sessionIds = [];
const previous = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, callId, techSessionId;
function restore(key, previousValue) {
  if (previousValue === undefined) delete process.env[key];
  else process.env[key] = previousValue;
}
const auditFor = shiftId => db.auditEvent.findMany({
  where: { action: "andon.shift.settings.update", resourceId: shiftId },
});
function direct(client, index, shiftId, body, extra = {}) {
  return updateCentralShift(client, {
    token: tokens[index], workstationId: stationIds[index], shiftId, body,
    requestId: "r12-04b-" + suffix, ipAddress: "127.0.0.1", ...extra,
  });
}
try {
  await db.shift.createMany({ data: shiftIds.map((id, i) => ({
    id, name: originals[i], startTime: "06:00", endTime: "14:00", active: true,
  })) });
  await db.machine.create({ data: { id: machineId, name: "CI shift machine " + suffix } });
  await db.workstation.createMany({ data: stationIds.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04b.shift." + i + "." + suffix,
      displayName: "CI shift delegate " + i, accountType: "person",
      roleLabel: i === 0 ? "Produção" : i === 1 ? "Manutenção" : "Gerente",
      isPrimaryAdmin: false, active: true, machineScope: "selected",
      passwordHash: "CI no password", mustChangePassword: false,
      permissions: { create: i < 2
        ? [{ key: "andon.read" }, { key: "andon.settings.open" }]
        : [{ key: "andon.read" }, { key: "production.schedule.write" }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    const session = await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id, workstationId: stationIds[i],
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    } });
    sessionIds.push(session.id);
  }
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerShiftRoutes(app);
  function send(index, shiftId, payload, headers = {}) {
    return app.inject({
      method: "PATCH", url: "/api/shifts/" + shiftId, payload,
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": stationIds[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]), ...headers,
      },
    });
  }

  const disabled = await send(0, shiftIds[0], { name: originals[0] + " disabled" });
  assert.equal(disabled.statusCode, 403, disabled.body);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "1";
  assert.equal((await send(0, shiftIds[0], { active: false }, { cookie: "" })).statusCode, 401);
  assert.equal((await send(0, shiftIds[0], { active: false },
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(0, shiftIds[0], { active: false },
    { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await send(2, shiftIds[0], { active: false })).statusCode, 403);
  assert.equal((await send(0, shiftIds[0], { name: originals[1] })).statusCode, 409);
  for (const invalid of [
    {}, { id: "fake" }, { machineId: machineId },
    { startTime: "25:12" }, { endTime: "99:99" },
    { active: "false" }, { name: " " },
  ]) assert.equal((await send(0, shiftIds[0], invalid)).statusCode, 400);
  assert.equal((await auditFor(shiftIds[0])).length, 0);

  const updated = await send(0, shiftIds[0], {
    name: originals[0] + " updated",
    startTime: "22:00", endTime: "06:00", active: true,
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().startTime, "22:00");
  assert.equal(updated.json().endTime, "06:00");
  assert.equal((await auditFor(shiftIds[0])).length, 1);
  const audit = (await auditFor(shiftIds[0]))[0];
  assert.equal(audit.actorUserId, userIds[0]);
  assert.equal(audit.workstationId, stationIds[0]);
  assert.equal(audit.before.startTime, "06:00");
  assert.equal(audit.after.startTime, "22:00");
  assert(!JSON.stringify(audit).includes(tokens[0]));

  // Current shift IDs embedded in attendance rows MUST NOT be reinterpreted.
  const call = await db.andonCall.create({ data: {
    machineId, status: "in_progress", category: "maintenance",
    subtype: "mechanical", criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;
  const session = await db.technicianSession.create({ data: {
    callId, machineId, technicianName: "CI shift maintainer " + suffix,
    shiftId: shiftIds[0], startedAt: new Date(),
  } });
  techSessionId = session.id;
  const blocked = await send(0, shiftIds[0], { active: false });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().error, "shift_has_active_session");
  await db.technicianSession.delete({ where: { id: techSessionId } });
  techSessionId = undefined;

  // Roll back every field when the atomic append-only audit insert fails.
  const prior = await db.shift.findUniqueOrThrow({ where: { id: shiftIds[0] } });
  await assert.rejects(direct(db, 0, shiftIds[0], { name: "Should rollback " + suffix },
    { ipAddress: "x".repeat(46) }));
  assert.equal((await db.shift.findUniqueOrThrow({ where: { id: shiftIds[0] } })).name, prior.name);
  assert.equal((await auditFor(shiftIds[0])).length, 1);

  // Two humans / two workstations / two Prisma clients compete to assign
  // the same shift name, protected by the catalog advisory lock.
  const common = "CI Global Shift " + suffix;
  const contenders = await Promise.allSettled([
    direct(db, 0, shiftIds[0], { name: common }),
    direct(concurrent, 1, shiftIds[1], { name: common }),
  ]);
  assert.equal(contenders.filter(v => v.status === "fulfilled").length, 1);
  assert.equal(contenders.filter(v => v.status === "rejected").length, 1);
  assert.equal(contenders.find(v => v.status === "rejected").reason.code, "shift_name_in_use");
  assert.equal(await db.shift.count({ where: { name: common } }), 1);
  // A role label by itself cannot restore a revoked permission.
  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  assert.equal((await send(0, shiftIds[0], { active: false })).statusCode, 403);
  process.env.ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED = "0";
  const switchedOff = await send(1, shiftIds[1], { active: false });
  assert.equal(switchedOff.statusCode, 403);
  assert.equal(switchedOff.json().error, "central_action_not_supported");

  console.log("R12-04B shift UPDATE PG PASS: flag OFF, role-agnostic global grant, CSRF/Origin, overnight, 2-workstation name race, active shift safety, atomic audit rollback, revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", previous.central);
  restore("ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED", previous.flag);
  restore("ANDON_ACCESS_ORIGIN", previous.origin);
  if (techSessionId) await db.technicianSession.deleteMany({ where: { id: techSessionId } });
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: { in: stationIds } } });
  await db.shift.deleteMany({ where: { id: { in: shiftIds } } });
  await concurrent.$disconnect();
  await db.$disconnect();
}
