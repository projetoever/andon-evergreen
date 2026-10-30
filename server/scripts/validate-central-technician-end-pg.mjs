import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { runCentralTechnicianEnd } from "../dist/access/centralTechnicianEnd.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Technician exit test requires isolated /andon_test and central access OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-tech-end-" + n;
const stationId = "ws_" + randomUUID();
const otherMachineId = "ci-tech-other-" + n;
const technicianIds = ["ci-tech-a-" + n, "ci-tech-b-" + n];
const pinValues = ["67" + n.slice(0, 4).replace(/[^0-9]/g, "4"),
                   "68" + n.slice(0, 4).replace(/[^0-9]/g, "5")];
const token = randomBytes(32).toString("hex");
const login = "ci.techend." + n;
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, callId;
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI technician end", isActive: true },
    { id: otherMachineId, name: "CI foreign machine", isActive: true },
  ] });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  for (let i = 0; i < technicianIds.length; i++) {
    await db.technician.create({ data: {
      id: technicianIds[i], employeeId: technicianIds[i],
      name: "CI Technician " + i + " " + n, active: true,
      technicalArea: "mechanical", pinHash: await hashCredential(pinValues[i]),
    } });
  }
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI manager", roleLabel: "Maintenance",
    accountType: "person", machineScope: "selected",
    passwordHash: "test-only", mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "calls.technicians.manage" },
    ] }, machines: { create: [{ machineId }] },
  } });
  userId = user.id;
  const now = new Date();
  sessionId = (await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } })).id;
  callId = (await db.andonCall.create({ data: {
    machineId, category: "maintenance", subtype: "mechanical",
    status: "in_progress", criticality: "medium",
    openedAt: now, attendedAt: now, currentAttendanceStartedAt: now,
    technicianName: "CI Technician 0 " + n,
    technicianNames: technicianIds.map((_, i) => "CI Technician " + i + " " + n),
    technicianArea: "mechanical",
  } })).id;
  await db.technicianSession.createMany({ data: technicianIds.map((id, i) => ({
    callId, machineId, technicianId: id,
    technicianName: "CI Technician " + i + " " + n,
    technicalArea: "mechanical", phase: "maintenance",
    cycleIndex: 1, workstationId: stationId, startedAt: now,
  })) });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCallRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const path = "/api/andon-calls/" + callId + "/technicians/end";
  const payload = i => ({
    credential: { method: "pin", value: pinValues[i] }, reason: "handoff",
  });
  const send = (i, extra = {}, body = payload(i)) => app.inject({
    method: "PATCH", url: path, headers: { ...headers, ...extra }, payload: body,
  });
  const count = () => db.technicianSession.count({ where: { callId, endedAt: null } });
  const audited = () => db.auditEvent.count({
    where: { action: "calls.technicians.end", resourceId: callId },
  });

  assert.equal((await send(0, { cookie: "" })).statusCode, 401);
  assert.equal((await send(0, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(0, {}, { ...payload(0), technicianName: "spoof" })).statusCode, 400);
  assert.equal((await send(0, {}, { reason: "no credential" })).statusCode, 400);
  assert.equal(await count(), 2);

  // An audit insert error must roll back technician session termination.
  await assert.rejects(runCentralTechnicianEnd(db, {
    token, workstationId: stationId, callId,
    credential: payload(0).credential, ipAddress: "x".repeat(46),
  }));
  assert.equal(await count(), 2);
  assert.equal(await audited(), 0);

  // Machine+technician advisory locks prevent both concurrent requests
  // from removing the last maintainer (2->1 allowed, 1->0 denied).
  const race = await Promise.all([send(0), send(1)]);
  assert.deepEqual(race.map(x => x.statusCode).sort(), [200, 400],
    race.map(x => x.body).join("\n"));
  assert.equal(await count(), 1);
  assert.equal(await audited(), 1);
  const surviving = await db.technicianSession.findFirstOrThrow({
    where: { callId, endedAt: null },
  });
  const survivorIndex = technicianIds.indexOf(surviving.technicianId);
  assert(survivorIndex >= 0);
  assert.equal((await send(survivorIndex)).statusCode, 400);
  assert.equal(await count(), 1);
  assert.equal(await audited(), 1);

  // After the call moves to follow-up, the last participant may exit.
  await db.andonCall.update({ where: { id: callId },
    data: { status: "post_maintenance" } });
  await db.technicianSession.update({ where: { id: surviving.id },
    data: { phase: "follow_up" } });
  const finish = await send(survivorIndex);
  assert.equal(finish.statusCode, 200, finish.body);
  assert.equal(await count(), 0);
  assert.equal(await audited(), 2);
  assert.equal((await send(survivorIndex)).statusCode, 404);
  assert.equal(await audited(), 2);

  process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "0";
  const disabled = await send(survivorIndex);
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");

  console.log("SEC-04 technician-end PG PASS: PIN, ACL, CSRF, spoof, audit rollback, race, last-maintainer, follow-up, flag OFF");
} finally {
  if (app) await app.close();
  for (const [key, value] of Object.entries(old)) {
    const env = key === "central" ? "ANDON_CENTRAL_ACCESS_ENABLED"
      : key === "flag" ? "ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED"
      : "ANDON_ACCESS_ORIGIN";
    if (value === undefined) delete process.env[env];
    else process.env[env] = value;
  }
  if (callId) {
    await db.technicianSession.deleteMany({ where: { callId } });
    await db.andonCall.deleteMany({ where: { id: callId } });
  }
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, otherMachineId] } } });
  await db.$disconnect();
}
