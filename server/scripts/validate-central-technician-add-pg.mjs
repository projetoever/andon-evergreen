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
import { runCentralTechnicianAdd } from "../dist/access/centralTechnicianAdd.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Central technician-add test requires isolated /andon_test with central access OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-tech-add-" + n;
const outsideMachineId = "ci-tech-outside-" + n;
const stationId = "ws_" + randomUUID();
const login = "ci.techadd." + n;
const token = randomBytes(32).toString("hex");
const technicianIds = [0, 1, 2, 3].map(i => "ci-add-tech-" + i + "-" + n);
const pins = [0, 1, 2, 3].map(i => String(60 + i) +
  randomBytes(3).toString("hex").replace(/[a-f]/g, "7").slice(0, 6));
const previous = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId;
const callIds = [];
const credentials = i => ({ method: "pin", value: pins[i] });
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI add same machine", isActive: true },
    { id: outsideMachineId, name: "CI other machine", isActive: true },
  ] });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  for (let i = 0; i < 4; i++) {
    await db.technician.create({ data: {
      id: technicianIds[i], employeeId: technicianIds[i],
      name: "CI add tech " + i + " " + n, active: true,
      technicalArea: "mechanical", pinHash: await hashCredential(pins[i]),
    } });
  }
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI add maintainer", roleLabel: "Maintenance",
    accountType: "person", machineScope: "selected",
    passwordHash: "CI no human login", mustChangePassword: false,
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

  const createCall = async (machine = machineId, status = "in_progress", isSystemTest = false) => {
    const call = await db.andonCall.create({ data: {
      machineId: machine, category: "maintenance", subtype: "mechanical",
      status, criticality: "medium", isSystemTest, openedAt: now, attendedAt: now,
      currentAttendanceStartedAt: status === "in_progress" ? now : null,
    } });
    callIds.push(call.id);
    return call.id;
  };
  const callA = await createCall();
  const callB = await createCall();
  const foreignCall = await createCall(outsideMachineId);
  const systemTest = await createCall(machineId, "in_progress", true);
  await db.technicianSession.create({ data: {
    callId: callA, machineId, technicianId: technicianIds[0],
    technicianName: "CI add tech 0 " + n, technicalArea: "mechanical",
    phase: "maintenance", cycleIndex: 1, workstationId: stationId,
    startedAt: now,
  } });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "1";
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
    origin: "https://andon.test", "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (id, group, extra = {}, body = { credentials: group.map(credentials) }) =>
    app.inject({ method: "POST", url: "/api/andon-calls/" + id + "/technicians",
      headers: { ...headers, ...extra }, payload: body });
  const count = id => db.technicianSession.count({ where: { callId: id, endedAt: null } });
  const auditCount = id => db.auditEvent.count({
    where: { action: "calls.technicians.add", resourceId: id },
  });

  assert.equal((await send(callA, [1], { cookie: "" })).statusCode, 401);
  assert.equal((await send(callA, [1], { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(callA, [1], {}, {
    credentials: [credentials(1)], technicianName: "forged",
  })).statusCode, 400);
  assert.equal((await send(callA, [1], {}, {
    credentials: [{ ...credentials(1), id: "fake" }],
  })).statusCode, 400);
  assert.equal((await send(callA, [], {}, { credentials: [] })).statusCode, 400);
  assert.equal((await send(callA, [1, 1])).statusCode, 409);
  assert.equal((await send(callA, [1], {}, {
    credentials: [{ method: "pin", value: "99999999" }],
  })).statusCode, 403);
  assert.equal((await send(foreignCall, [1])).statusCode, 404);
  assert.equal((await send(systemTest, [1])).statusCode, 403);
  assert.equal(await count(callA), 1);
  assert.equal(await auditCount(callA), 0);

  await assert.rejects(runCentralTechnicianAdd(db, {
    token, workstationId: stationId, callId: callA,
    credentials: [credentials(1)], ipAddress: "x".repeat(46),
  }));
  assert.equal(await count(callA), 1, "audit failure must roll back addition");
  assert.equal(await auditCount(callA), 0);
  const added = await send(callA, [1]);
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(await count(callA), 2);
  assert.equal(await auditCount(callA), 1);
  const newSession = await db.technicianSession.findFirstOrThrow({
    where: { callId: callA, technicianId: technicianIds[1], endedAt: null },
  });
  assert.equal(newSession.phase, "maintenance");
  assert.equal(newSession.workstationId, stationId);
  assert.equal((await send(callA, [1])).statusCode, 409);
  assert.equal((await send(callB, [1])).statusCode, 400,
    "a technician already active on another call cannot be allocated");

  // Two machines/calls requesting the same technician must never create
  // two active sessions, even when callers race.
  const race = await Promise.all([send(callA, [2]), send(callB, [2])]);
  assert.deepEqual(race.map(x => x.statusCode).sort(), [201, 400], race.map(x => x.body).join("\n"));
  assert.equal(await db.technicianSession.count({
    where: { technicianId: technicianIds[2], endedAt: null },
  }), 1);
  assert.equal(await auditCount(callA) + await auditCount(callB), 2);

  // Follow-up keeps its own phase and technician-cycle records.
  await db.andonCall.update({ where: { id: callA }, data: { status: "post_maintenance" } });
  const followed = await send(callA, [3]);
  assert.equal(followed.statusCode, 201, followed.body);
  const followSession = await db.technicianSession.findFirstOrThrow({
    where: { callId: callA, technicianId: technicianIds[3], endedAt: null },
  });
  assert.equal(followSession.phase, "follow_up");
  assert.equal(followSession.workstationId, stationId);

  process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "0";
  const denied = await send(callA, [1]);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  assert.equal((await send(callA, [1])).statusCode, 401);
  console.log("SEC-04/2M technician-add PG PASS: selected ACL, PIN, CSRF, spoof, duplicate, cross-call exclusivity, race, audit rollback, follow-up, flag OFF");
} finally {
  if (app) await app.close();
  for (const [field, env] of [
    ["central", "ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag", "ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED"],
    ["origin", "ANDON_ACCESS_ORIGIN"],
  ]) {
    if (previous[field] === undefined) delete process.env[env];
    else process.env[env] = previous[field];
  }
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, outsideMachineId] } } });
  await db.$disconnect();
}
