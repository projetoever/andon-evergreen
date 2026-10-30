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
import { runCentralDiagnosisEdit } from "../dist/access/centralDiagnosisEdit.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Diagnosis edit PG test requires /andon_test and central access OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-diag-" + n, outsideId = "ci-diag-outside-" + n;
const stationId = "ws_" + randomUUID();
const technicianId = "ci-diag-tech-" + n;
const pin = "73" + randomBytes(3).toString("hex").replace(/[a-f]/g, "7").slice(0, 6);
const initialValue = "ci_diag_old_" + n, newValue = "ci_diag_new_" + n;
const login = "ci.diag." + n, token = randomBytes(32).toString("hex");
const prev = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
const callIds = [];
let app, userId, sessionId, eventId;
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI diagnosis", isActive: true },
    { id: outsideId, name: "CI outside", isActive: true },
  ] });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  await db.failureClassification.createMany({ data: [
    { value: initialValue, label: "Old diagnosis", responsibility: "maintenance",
      analyticsDisposition: "include" },
    { value: newValue, label: "New diagnosis", responsibility: "process",
      analyticsDisposition: "false_call" },
  ] });
  await db.technician.create({ data: {
    id: technicianId, employeeId: technicianId,
    name: "CI diagnosis tech " + n, active: true,
    technicalArea: "mechanical", pinHash: await hashCredential(pin),
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI diagnosis editor", roleLabel: "Maintenance",
    accountType: "person", machineScope: "selected", mustChangePassword: false,
    passwordHash: "not-for-human-login",
    permissions: { create: [
      { key: "andon.read" }, { key: "history.read" }, { key: "diagnosis.edit" },
    ] },
    machines: { create: [{ machineId }] },
  } });
  userId = user.id;
  const now = new Date();
  sessionId = (await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } })).id;
  const createCall = async (machine = machineId, status = "finished", isSystemTest = false) => {
    const call = await db.andonCall.create({ data: {
      machineId: machine, category: "maintenance", subtype: "mechanical",
      status, criticality: "medium", openedAt: now, finishedAt: now,
      isSystemTest, failureClassification: initialValue,
      failureDescription: "Old failure", failureResponsibility: "maintenance",
      analyticsDisposition: "include",
    } });
    callIds.push(call.id);
    return call.id;
  };
  const id = await createCall();
  const outsideCall = await createCall(outsideId);
  const testingCall = await createCall(machineId, "finished", true);
  const openCall = await createCall(machineId, "open");
  eventId = (await db.failureEvent.create({ data: {
    machineId, callId: id, startedAt: new Date(now.getTime() - 120000),
    endedAt: now, source: "ci", classification: initialValue, notes: "Old failure",
    failureResponsibility: "maintenance", analyticsDisposition: "include",
  } })).id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "1";
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
  const payload = {
    failureClassification: newValue, failureDescription: "Corrected diagnosis", pin,
  };
  const send = (callId = id, extra = {}, body = payload) =>
    app.inject({ method: "PATCH",
      url: "/api/andon-calls/" + callId + "/failure-details",
      headers: { ...headers, ...extra }, payload: body });
  const changes = () => db.failureDiagnosisAudit.count({ where: { callId: id } });
  const audits = () => db.auditEvent.count({
    where: { action: "diagnosis.edit", resourceId: id },
  });

  assert.equal((await send(id, { cookie: "" })).statusCode, 401);
  assert.equal((await send(id, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(id, {}, { ...payload, editor: "forged" })).statusCode, 400);
  assert.equal((await send(id, {}, { ...payload, pin: "99999999" })).statusCode, 403);
  assert.equal((await send(outsideCall)).statusCode, 404);
  assert.equal((await send(testingCall)).statusCode, 403);
  assert.equal((await send(openCall)).statusCode, 409);
  assert.equal(await changes(), 0);
  assert.equal(await audits(), 0);

  const descriptionCall = await createCall();
  const descriptionOnly = await send(descriptionCall, {}, {
    ...payload, failureClassification: initialValue,
    failureDescription: "New explanation, unchanged BI classification",
  });
  assert.equal(descriptionOnly.statusCode, 200, descriptionOnly.body);
  assert.equal(descriptionOnly.json().failureClassification, initialValue);
  assert.equal((await db.auditEvent.count({
    where: { action: "diagnosis.edit", resourceId: descriptionCall },
  })), 1, "description edit needs no analytics.reclassify grant");

  const denied = await send();
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(denied.json().error, "permission_denied");
  assert.equal(await changes(), 0);
  assert.equal(await audits(), 0);
  await db.accessPermission.create({ data: { userId, key: "analytics.reclassify" } });
  assert.equal((await send(id, {}, { ...payload, pin: "99999999" })).statusCode, 401);

  // Force a failure in the same transaction after the domain attempts
  // to persist the diagnosis: no partial call/event/audit is permitted.
  await assert.rejects(runCentralDiagnosisEdit(db, {
    token, workstationId: stationId, callId: id,
    classification: newValue, description: "Corrected diagnosis",
    pin, ipAddress: "x".repeat(46),
  }));
  assert.equal((await db.andonCall.findUniqueOrThrow({
    where: { id },
  })).failureClassification, initialValue);
  assert.equal((await db.failureEvent.findUniqueOrThrow({
    where: { id: eventId },
  })).classification, initialValue);
  assert.equal(await changes(), 0);
  assert.equal(await audits(), 0);

  const updated = await send();
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().failureClassification, newValue);
  assert.equal(updated.json().failureDescription, "Corrected diagnosis");
  assert.equal((await db.failureEvent.findUniqueOrThrow({
    where: { id: eventId },
  })).classification, newValue);
  assert.equal(await changes(), 1);
  assert.equal(await audits(), 1);
  const detail = await db.failureDiagnosisAudit.findFirstOrThrow({ where: { callId: id } });
  assert.equal(detail.technicianId, technicianId);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { action: "diagnosis.edit", resourceId: id },
  });
  assert.equal(audit.actorLogin, login);
  assert.equal(audit.workstationId, stationId);
  assert.equal((await send()).statusCode, 200);
  assert.equal(await changes(), 1, "replay must not duplicate diagnosis audit");
  assert.equal(await audits(), 1);

  process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "0";
  const disabled = await send();
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  assert.equal((await send()).statusCode, 401);
  console.log("SEC-04/2N diagnosis edit PG PASS: PIN, role, CSRF, scope, finished only, event sync, double audit, rollback, replay, revocation");
} finally {
  if (app) await app.close();
  for (const [prop,env] of [
    ["central","ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag","ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED"],
    ["origin","ANDON_ACCESS_ORIGIN"],
  ]) {
    if (prev[prop] === undefined) delete process.env[env];
    else process.env[env] = prev[prop];
  }
  await db.failureDiagnosisAudit.deleteMany({ where: { callId: { in: callIds } } });
  if (eventId) await db.failureEvent.deleteMany({ where: { id: eventId } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: technicianId } });
  await db.failureClassification.deleteMany({ where: { value: { in: [initialValue,newValue] } } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId,outsideId] } } });
  await db.$disconnect();
}
