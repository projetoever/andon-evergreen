import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, tokenHash } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test") {
  throw new Error("REFINE13 PG test requires isolated /andon_test");
}
const previousEnv = Object.fromEntries([
  "ANDON_CENTRAL_ACCESS_ENABLED",
  "ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED",
  "ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED",
  "ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED",
  "ANDON_CENTRAL_DECLARED_ATTENDANCE_HTTP_ENABLED",
  "ANDON_ACCESS_ORIGIN",
].map(k => [k, process.env[k]]));
Object.assign(process.env, {
  ANDON_CENTRAL_ACCESS_ENABLED: "1",
  ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED: "1",
  ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED: "1",
  ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED: "1",
  ANDON_CENTRAL_DECLARED_ATTENDANCE_HTTP_ENABLED: "1",
  ANDON_ACCESS_ORIGIN: "https://andon.test",
});

const db = new PrismaClient();
const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "r13-machine-" + nonce;
const workstationId = "ws_" + randomUUID();
const technicianIds = ["r13-tech-a-" + nonce, "r13-tech-b-" + nonce];
const token = randomBytes(32).toString("hex");
let userId, callId, app, settingsBefore;
try {
  settingsBefore = await db.systemSettings.findUnique({ where: { id: "global" }, select: { attendanceMode: true } });
  await db.systemSettings.upsert({
    where: { id: "global" },
    create: { id: "global", attendanceMode: "name" },
    update: { attendanceMode: "name" },
  });
  await db.workstation.create({
    data: { id: workstationId, active: true, pendingApproval: false, allowOperational: true },
  });
  await db.machine.create({
    data: { id: machineId, name: "REFINE13 synthetic machine", isActive: true },
  });
  for (let i = 0; i < technicianIds.length; i++) {
    await db.technician.create({
      data: {
        id: technicianIds[i], employeeId: "r13-" + nonce + "-" + i,
        name: "REFINE13 Technician " + i + " " + nonce,
        technicalArea: "mechanical", active: true,
      },
    });
  }
  const user = await db.accessUser.create({
    data: {
      login: "r13." + nonce, displayName: "R13 declared identity actor",
      roleLabel: "Maintenance", accountType: "person", isPrimaryAdmin: false,
      machineScope: "selected", passwordHash: "CI password not used",
      mustChangePassword: false,
      permissions: { create: [
        { key: "andon.read" }, { key: "calls.attend" },
        { key: "calls.technicians.manage" },
      ] },
      machines: { create: [{ machineId }] },
    },
  });
  userId = user.id;
  const now = new Date();
  await db.accessSession.create({
    data: {
      tokenHash: tokenHash(token), userId, workstationId,
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    },
  });
  const call = await db.andonCall.create({
    data: { machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date() },
  });
  callId = call.id;

  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCallRoutes(app);
  const headers = {
    origin: "https://andon.test", "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrfToken(token),
  };
  const inject = (method, suffix, payload, customHeaders = {}) =>
    app.inject({ method, url: "/api/andon-calls/" + callId + suffix,
      payload, headers: { ...headers, ...customHeaders } });

  // Server feature OFF: do not mutate with mere browser-selected ID.
  process.env.ANDON_CENTRAL_DECLARED_ATTENDANCE_HTTP_ENABLED = "0";
  assert.equal((await inject("PATCH", "/attend", { technicianIds: [technicianIds[0]] })).statusCode, 403);
  process.env.ANDON_CENTRAL_DECLARED_ATTENDANCE_HTTP_ENABLED = "1";
  assert.equal((await inject("PATCH", "/attend", { technicianIds: [technicianIds[0]] },
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  const invalid = await inject("PATCH", "/attend", { technicianIds: ["foreign-tech"] });
  assert.notEqual(invalid.statusCode, 200);
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: callId } })).status, "open");
  const started = await inject("PATCH", "/attend", { technicianIds: [technicianIds[0]] });
  assert.equal(started.statusCode, 200, started.body);
  assert.equal(started.json().status, "in_progress");
  assert.equal(await db.technicianSession.count({ where: { callId, endedAt: null } }), 1);

  const added = await inject("POST", "/technicians", { technicianIds: [technicianIds[1]] });
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(await db.technicianSession.count({ where: { callId, endedAt: null } }), 2);

  const ended = await inject("PATCH", "/technicians/end", {
    technicianId: technicianIds[0], reason: "support_finished",
  });
  assert.equal(ended.statusCode, 200, ended.body);
  assert.equal(await db.technicianSession.count({ where: { callId, endedAt: null } }), 1);
  const last = await inject("PATCH", "/technicians/end", {
    technicianId: technicianIds[1], reason: "support_finished",
  });
  assert.notEqual(last.statusCode, 200, "last technician must remain attending");
  assert.equal(await db.technicianSession.count({ where: { callId, endedAt: null } }), 1);

  const audits = await db.auditEvent.findMany({
    where: { resourceId: callId, resourceType: "andon_call" },
  });
  for (const action of ["calls.attend", "calls.technicians.add", "calls.technicians.end"]) {
    const audit = audits.find(event => event.action === action);
    assert(audit, "missing " + action + " audit");
    assert.equal(audit.actorUserId, userId);
    assert.equal(audit.workstationId, workstationId);
    assert.equal(audit.after.identificationMethod, "name_declared");
  }
  assert(!JSON.stringify(audits).includes(token), "session secret must not be logged");
  console.log("REFINE13 declared names PG PASS: flag, CSRF, start/add/end, last technician, audit");
} finally {
  if (app) await app.close();
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
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.workstation.deleteMany({ where: { id: workstationId } });
  if (settingsBefore) await db.systemSettings.update({
    where: { id: "global" }, data: { attendanceMode: settingsBefore.attendanceMode },
  });
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await db.$disconnect();
}
