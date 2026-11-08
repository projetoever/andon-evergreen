import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, tokenHash } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { runCentralDeclaredNameAttendance } from "../dist/access/centralDeclaredNameAttendance.js";

// R12-02C1: never use the HML, factory, or a database other than isolated andon_test.
const parsed = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    parsed.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED === "1") {
  throw Error("R12-02C1 requires explicit /andon_test with both central name flags OFF initially");
}

const db = new PrismaClient();
const contender = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineIds = [0, 1, 2].map(i => "ci-namedecl-machine-" + i + "-" + n);
const stationIds = [0, 1].map(() => "ws_" + randomUUID());
const technicianIds = [0, 1].map(i => "ci-namedecl-tech-" + i + "-" + n);
const technicianNames = [0, 1].map(i => "CI Declared Maintainer " + i + " " + n);
const tokens = [0, 1].map(() => randomBytes(32).toString("hex"));
const userIds = [];
const sessionIds = [];
const callIds = [];
let app;
const previous = {
  access: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  names: process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
function restore(key, previousValue) {
  if (previousValue === undefined) delete process.env[key];
  else process.env[key] = previousValue;
}
function declared(client, i, callId, names = [technicianNames[0]], extra = {}) {
  return runCentralDeclaredNameAttendance(client, {
    token: tokens[i], workstationId: stationIds[i], callId,
    technicianNames: names, requestId: "ci-namedecl-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}
async function newCall(machineId) {
  const record = await db.andonCall.create({ data: {
    machineId, category: "maintenance", subtype: "mechanical",
    status: "open", criticality: "medium", openedAt: new Date(),
  } });
  callIds.push(record.id);
  return record.id;
}
const auditsFor = callId => db.auditEvent.findMany({
  where: { action: "calls.attend.declared", resourceType: "andon_call", resourceId: callId },
});
const sessionsFor = callId => db.technicianSession.findMany({ where: { callId } });
async function unchanged(callId, machineId) {
  const call = await db.andonCall.findUniqueOrThrow({ where: { id: callId } });
  assert.equal(call.status, "open", "failed declaration must preserve call status");
  assert.equal((await sessionsFor(callId)).length, 0, "failed declaration must not create sessions");
  assert.equal((await auditsFor(callId)).length, 0, "failed declaration must not leave success audit");
  const machine = await db.machine.findUniqueOrThrow({ where: { id: machineId } });
  assert.equal(machine.currentCallId, null, "failed declaration must not change the machine's selected call");
}

try {
  await db.machine.createMany({ data: machineIds.map((id, i) => ({
    id, name: "R12 C1 isolated " + i, isActive: true,
  })) });
  await db.workstation.createMany({ data: stationIds.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < technicianIds.length; i++) {
    await db.technician.create({ data: {
      id: technicianIds[i], employeeId: technicianIds[i],
      name: technicianNames[i], active: true, technicalArea: "mechanical",
    } });
  }
  for (let i = 0; i < 2; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.name.declared." + i + "." + n, displayName: "CI declared operator " + i,
      roleLabel: i === 0 ? "Production" : "Maintenance", accountType: "person",
      machineScope: "selected", passwordHash: "CI no login", mustChangePassword: false,
      permissions: { create: [{ key: "andon.read" }, { key: "calls.attend" }] },
      machines: { create: machineIds.map(machineId => ({ machineId })) },
    } });
    userIds.push(user.id);
    const now = new Date();
    const session = await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id, workstationId: stationIds[i],
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
    } });
    sessionIds.push(session.id);
  }
  const callA = await newCall(machineIds[0]);
  const callB = await newCall(machineIds[1]);
  const callC = await newCall(machineIds[2]);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCallRoutes(app);

  function send(callId, i, names, extraHeaders = {}, body = { technicianNames: names }) {
    return app.inject({ method: "PATCH",
      url: "/api/andon-calls/" + callId + "/attend-declared",
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": stationIds[i],
        cookie: "__Host-andon-access=" + tokens[i],
        "x-andon-csrf": csrfToken(tokens[i]), ...extraHeaders,
      }, payload: body,
    });
  }

  process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "0";
  const disabled = await send(callC, 0, [technicianNames[1]]);
  assert.equal(disabled.statusCode, 403, disabled.body);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "1";
  const guest = await send(callC, 0, [technicianNames[1]], { cookie: "" });
  assert.equal(guest.statusCode, 401, guest.body);
  const csrfDenied = await send(callC, 0, [technicianNames[1]],
    { "x-andon-csrf": "0".repeat(64) });
  assert.equal(csrfDenied.statusCode, 403, csrfDenied.body);
  const forged = await send(callC, 0, [technicianNames[1]], {}, {
    technicianNames: [technicianNames[1]], identityVerified: true,
  });
  assert.equal(forged.statusCode, 400, forged.body);
  const duplicate = await send(callC, 0, [technicianNames[1], technicianNames[1]]);
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  const unknown = await send(callC, 0, ["Unknown CI Name " + n]);
  assert.equal(unknown.statusCode, 404, unknown.body);
  await unchanged(callC, machineIds[2]);

  // Actual distinct PostgreSQL clients + different humans and workstations
  // compete for the same technician on different machines/calls.
  const results = await Promise.allSettled([
    declared(db, 0, callA),
    declared(contender, 1, callB),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1,
    "at most one declared assignment may win across real connections");
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  const losing = results.find(r => r.status === "rejected");
  assert.equal(losing.reason?.code, "technician_already_attending",
    "the losing workstation must not create a concurrent active session");
  const winningIndex = results[0].status === "fulfilled" ? 0 : 1;
  const winningCall = winningIndex === 0 ? callA : callB;
  const losingCall = winningIndex === 0 ? callB : callA;
  const winningMachine = machineIds[winningIndex];
  const losingMachine = machineIds[1 - winningIndex];
  const winningUser = userIds[winningIndex];
  const winningStation = stationIds[winningIndex];
  const successes = await db.technicianSession.findMany({
    where: { technicianId: technicianIds[0], endedAt: null },
  });
  assert.equal(successes.length, 1);
  assert.equal(successes[0].callId, winningCall);
  assert.equal(successes[0].workstationId, winningStation);
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: winningCall } })).status, "in_progress");
  const winningAudits = await auditsFor(winningCall);
  assert.equal(winningAudits.length, 1);
  const audit = winningAudits[0];
  assert.equal(audit.actorUserId, winningUser);
  assert.equal(audit.workstationId, winningStation);
  assert.equal(audit.action, "calls.attend.declared");
  assert.equal(audit.reason, "operator_selected_name");
  assert.equal(audit.after.identificationMethod, "name");
  assert.equal(audit.after.identityVerified, false);
  assert.equal(audit.after.declaredByUserId, winningUser);
  assert.deepEqual(audit.after.technicianIds, [technicianIds[0]]);
  assert.equal(audit.machineId, winningMachine);
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: winningMachine } })).currentCallId, winningCall);
  assert(!JSON.stringify(audit).includes(tokens[winningIndex]));
  await unchanged(losingCall, losingMachine);

  // Both attendance + audit MUST roll back if the durable audit insertion
  // fails, even after the call and machine have been changed inside tx.
  await assert.rejects(declared(db, 0, callC,
    [technicianNames[1]], { ipAddress: "x".repeat(46) }));
  await unchanged(callC, machineIds[2]);

  // Real HTTP successful declaration; replays are not idempotent success.
  const httpSuccess = await send(callC, 0, [technicianNames[1]]);
  assert.equal(httpSuccess.statusCode, 200, httpSuccess.body);
  assert.equal(httpSuccess.json().status, "in_progress");
  assert.equal((await sessionsFor(callC)).length, 1);
  assert.equal((await auditsFor(callC)).length, 1);
  const replay = await send(callC, 0, [technicianNames[1]]);
  assert.equal(replay.statusCode, 409, replay.body);

  // Revoked human session MUST fail closed on every next write.
  await db.accessSession.update({ where: { id: sessionIds[0] },
    data: { revokedAt: new Date() } });
  const revoked = await send(losingCall, 0, [technicianNames[1]]);
  assert.equal(revoked.statusCode, 401, revoked.body);

  console.log("R12-02C1 declared-name PG PASS: HTTP flag/CSRF/body; two humans+workstations+clients, exclusive technician, atomic audit/rollback, replay and session revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", previous.access);
  restore("ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED", previous.names);
  restore("ANDON_ACCESS_ORIGIN", previous.origin);
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.machine.deleteMany({ where: { id: { in: machineIds } } });
  await db.workstation.deleteMany({ where: { id: { in: stationIds } } });
  await contender.$disconnect();
  await db.$disconnect();
}
