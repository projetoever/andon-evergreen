import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerTechnicianRoutes } from "../dist/routes/technicians.js";
import { runCentralTechnicianIdentification } from "../dist/access/centralTechnicianIdentity.js";

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    dbUrl.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Identification acceptance requires isolated /andon_test and central OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-identify-" + n, foreignMachineId = "ci-identify-foreign-" + n;
const stationId = "ws_" + randomUUID();
const technicianId = "ci-identify-tech-" + n;
const pin = "76" + randomBytes(3).toString("hex").replace(/[a-f]/g, "7").slice(0, 6);
const token = randomBytes(32).toString("hex"), login = "ci.identity." + n;
const previous = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId;
const callIds = [];
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI identify machine", isActive: true },
    { id: foreignMachineId, name: "CI foreign machine", isActive: true },
  ] });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  await db.technician.create({ data: {
    id: technicianId, employeeId: technicianId,
    name: "CI identifiable maintainer " + n, active: true,
    technicalArea: "mechanical", pinHash: await hashCredential(pin),
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI scoped identification", roleLabel: "Manutenção",
    accountType: "person", machineScope: "selected", passwordHash: "test-only",
    mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "calls.attend" },
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
  const createCall = async (machine = machineId, isSystemTest = false) => {
    const c = await db.andonCall.create({ data: {
      machineId: machine, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: now, isSystemTest,
    } });
    callIds.push(c.id);
    return c.id;
  };
  const callId = await createCall(), foreignCall = await createCall(foreignMachineId);
  const testCall = await createCall(machineId, true);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async request => {
    Object.defineProperty(request.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerTechnicianRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const post = (call = callId, extraHeaders = {}, payload = { callId: call, method: "pin", value: pin }) =>
    app.inject({ method: "POST", url: "/api/technicians/identify",
      headers: { ...headers, ...extraHeaders }, payload });
  const audit = () => db.auditEvent.count({ where: {
    action: "technician.credential.identified", resourceId: callId,
  } });
  assert.equal((await post(callId, { cookie: "" })).statusCode, 401);
  assert.equal((await post(callId, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await post(callId, {}, { method: "pin", value: pin })).statusCode, 400);
  assert.equal((await post(callId, {}, { callId, method: "pin", value: pin, id: technicianId })).statusCode, 400);
  assert.equal((await post(foreignCall)).statusCode, 404);
  assert.equal((await post(testCall)).statusCode, 409);
  assert.equal((await post(callId, {}, { callId, method: "pin", value: "99999999" })).statusCode, 404);
  assert.equal(await audit(), 0);

  // Invalid audit metadata must roll back a successful credential match.
  await assert.rejects(runCentralTechnicianIdentification(db, {
    token, workstationId: stationId, callId, method: "pin", value: pin,
    ipAddress: "x".repeat(46),
  }));
  assert.equal(await audit(), 0);
  const ok = await post();
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().id, technicianId);
  assert(!ok.body.includes(pin), "PIN must not appear in response");
  const event = await db.auditEvent.findFirstOrThrow({ where: {
    action: "technician.credential.identified", resourceId: callId,
  } });
  assert.equal(event.actorLogin, login);
  assert(!JSON.stringify(event).includes(pin), "PIN must never appear in audit");

  process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "0";
  const disabled = await post();
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  assert.equal((await post()).statusCode, 401);
  console.log("SEC-04 identity preflight PASS: scoped call, PIN, ACL, CSRF, audit rollback, no secret disclosure, revocation, flag OFF");
} finally {
  if (app) await app.close();
  for (const [prop, env] of [
    ["central", "ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag", "ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED"],
    ["origin", "ANDON_ACCESS_ORIGIN"],
  ]) {
    if (previous[prop] === undefined) delete process.env[env];
    else process.env[env] = previous[prop];
  }
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: technicianId } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, foreignMachineId] } } });
  await db.$disconnect();
}
