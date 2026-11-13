import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerTechnicianRoutes } from "../dist/routes/technicians.js";

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || dbUrl.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Technician availability test requires isolated /andon_test, central OFF at entry");

const db = new PrismaClient();
const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-avail-main-" + nonce;
const foreignMachineId = "ci-avail-foreign-" + nonce;
const workstationId = "ws_" + randomUUID();
const technicianIds = ["ci-avail-tech-a-" + nonce, "ci-avail-tech-b-" + nonce];
const accessUsers = [];
const sessionIds = [];
const callIds = [];
const previous = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app;
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI availability selected", isActive: true },
    { id: foreignMachineId, name: "CI availability restricted", isActive: true },
  ] });
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  for (let i = 0; i < 2; i++) {
    await db.technician.create({ data: {
      id: technicianIds[i], name: "CI availability tech " + i + " " + nonce,
      employeeId: technicianIds[i], technicalArea: "electrical", active: true,
    } });
  }
  const now = new Date();
  async function createCall(machineId, status = "in_progress") {
    const record = await db.andonCall.create({ data: {
      machineId, category: "maintenance", subtype: "electrical",
      status, criticality: "medium", openedAt: now,
      ...(status === "in_progress" ? { attendedAt: now, currentAttendanceStartedAt: now } : {}),
    } });
    callIds.push(record.id);
    return record.id;
  }
  const callMain = await createCall(machineId, "open");
  const callForeign = await createCall(foreignMachineId);
  await db.technicianSession.createMany({ data: [
    { callId: callForeign, machineId: foreignMachineId, technicianId: technicianIds[0],
      technicianName: "CI availability tech 0 " + nonce,
      technicalArea: "electrical", phase: "maintenance", cycleIndex: 1, startedAt: now },
    // Legacy active session without a technician ID MUST still block its name.
    { callId: callForeign, machineId: foreignMachineId, technicianId: null,
      technicianName: "CI availability tech 1 " + nonce,
      technicalArea: "electrical", phase: "maintenance", cycleIndex: 1, startedAt: now },
  ] });
  async function createUser(label, scope, canAttend) {
    const token = randomBytes(32).toString("hex");
    const user = await db.accessUser.create({ data: {
      login: "ci.availability." + label + "." + nonce,
      displayName: "CI availability " + label, roleLabel: label,
      accountType: "person", machineScope: scope,
      passwordHash: "CI no human login", mustChangePassword: false,
      permissions: { create: [
        { key: "andon.read" },
        ...(canAttend ? [{ key: "calls.attend" }] : []),
      ] },
      ...(scope === "selected" ? { machines: { create: [{ machineId }] } } : {}),
    } });
    accessUsers.push(user.id);
    sessionIds.push((await db.accessSession.create({ data: {
      tokenHash: tokenHash(token), userId: user.id, workstationId,
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now, expiresAt: new Date(now.getTime() + 3600000),
    } })).id);
    return token;
  }
  const adminToken = await createUser("admin", "all", true);
  const productionToken = await createUser("production", "selected", true);
  const viewerToken = await createUser("viewer", "selected", false);

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerTechnicianRoutes(app);
  const request = (token, callId = callMain, headers = {}) =>
    app.inject({
      method: "GET",
      url: "/api/technicians/availability?callId=" + encodeURIComponent(callId),
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": workstationId,
        cookie: token ? "__Host-andon-access=" + token : "",
        ...headers,
      },
    });

  const admin = await request(adminToken);
  const production = await request(productionToken);
  assert.equal(admin.statusCode, 200, admin.body);
  assert.equal(production.statusCode, 200, production.body);
  const expected = [...technicianIds].sort();
  assert.deepEqual(admin.json().busyTechnicianIds, expected);
  assert.deepEqual(production.json().busyTechnicianIds, expected,
    "Admin and production must see the same global occupied technician IDs");
  assert.deepEqual(Object.keys(production.json()).sort(), ["busyTechnicianIds", "checkedAt"]);
  assert.doesNotMatch(production.body, new RegExp(foreignMachineId + "|" + callForeign),
    "Selected-machine user must not receive foreign machine or call data");
  assert.equal((await request(productionToken, callForeign)).statusCode, 404,
    "Foreign call preflight must be invisible to selected-machine production");
  assert.equal((await request(viewerToken)).statusCode, 403);
  assert.equal((await request("")).statusCode, 401);
  assert.equal((await request(productionToken, callMain, { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await request(productionToken, "unknown")).statusCode, 404);

  await db.technicianSession.updateMany({
    where: { callId: callForeign, technicianId: technicianIds[0] },
    data: { endedAt: new Date() },
  });
  const refreshed = await request(productionToken);
  assert.equal(refreshed.statusCode, 200, refreshed.body);
  assert.deepEqual(refreshed.json().busyTechnicianIds, [technicianIds[1]],
    "Ended global session must make the technician available immediately");

  await db.workstation.update({ where: { id: workstationId }, data: { pendingApproval: true } });
  assert.equal((await request(productionToken)).statusCode, 403);
  await db.workstation.update({ where: { id: workstationId }, data: { pendingApproval: false } });
  await db.accessSession.update({ where: { id: sessionIds[1] }, data: { revokedAt: new Date() } });
  assert.equal((await request(productionToken)).statusCode, 401);
  console.log("P0 technician availability PG PASS: cross-scope parity, legacy, ended, foreign hidden, no PII, ACL, Origin, station and revocation");
} finally {
  if (app) await app.close();
  if (previous.central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previous.central;
  if (previous.origin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
  else process.env.ANDON_ACCESS_ORIGIN = previous.origin;
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  for (const id of accessUsers) {
    await db.accessSession.deleteMany({ where: { userId: id } });
    await db.accessMachine.deleteMany({ where: { userId: id } });
    await db.accessPermission.deleteMany({ where: { userId: id } });
    await db.accessUser.update({ where: { id }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, foreignMachineId] } } });
  await db.$disconnect();
}
