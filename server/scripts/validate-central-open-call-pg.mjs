import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { runCentralOpenCallWrite } from "../dist/access/centralOpenCallWrite.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Central opening integration requires explicit /andon_test and central writes OFF");
const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-open-" + n;
const categoryId = "ci_cat_" + n;
const stationId = "ws_" + randomUUID();
const otherMachineId = "ci-out-of-scope-" + n;
const login = "ci.open." + n;
const token = randomBytes(32).toString("hex");
let userId, sessionId, app;
let createdCallId;
const previous = {
  access: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
const auditCount = () => db.auditEvent.count({
  where: { action: "calls.open", resourceType: "andon_call",
    resourceId: createdCallId },
});
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "SEC-04 opening test", isActive: true,
      machineStatus: "running", requireWorkOrderAtOpen: true },
    { id: otherMachineId, name: "SEC-04 other machine", isActive: true },
  ] });
  await db.andonCategory.create({ data: {
    id: categoryId, displayName: "CI mechanical",
    categoryGroup: "maintenance", color: "#777777", active: true,
  } });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI opening operator", roleLabel: "Production",
    accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
    passwordHash: "CI credential disabled", mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }, { key: "calls.open" }] },
    machines: { create: [{ machineId }] },
  } });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  sessionId = session.id;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "1";
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
  const body = {
    machineId, category: "maintenance", subtype: categoryId,
    machineCondition: "stopped", workOrderNumber: "OS-CI-1234",
    origin: "kiosk", description: "CI isolated stop",
  };
  const send = (payload = body, extra = {}, method = "POST",
    path = "/api/andon-calls") => app.inject({
      method, url: path, headers: { ...headers, ...extra }, payload,
    });

  assert.equal((await send(body, { cookie: "" })).statusCode, 401);
  assert.equal((await send(body, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send({ ...body, createdBy: "admin" })).statusCode, 403,
    "the client cannot impersonate a creator");
  assert.equal((await send({ ...body, isSystemTest: true })).statusCode, 403);
  assert.equal((await send({ ...body, origin: "installer_health_check" })).statusCode, 403);
  assert.equal((await send({ ...body, machineId: otherMachineId })).statusCode, 403);
  assert.equal((await send({ ...body, workOrderNumber: undefined })).statusCode, 400);
  assert.equal((await send(body, {}, "POST", "/api/andon-calls/batch")).statusCode, 403);
  assert.equal(await db.andonCall.count({ where: { machineId } }), 0);

  // Two browsers race for the same sector. The domain lock must prevent
  // duplicate maintenance calls and double stop-ownership assignment.
  const race = await Promise.all([send(), send()]);
  assert.deepEqual(race.map(r => r.statusCode).sort(), [201, 400],
    race.map(r => r.body).join("\n"));
  const created = race.find(r => r.statusCode === 201).json();
  createdCallId = created.id;
  assert.equal(created.status, "open");
  assert.equal(created.createdBy, login);
  assert.equal(created.machineCondition, "stopped");
  assert.equal(created.workOrderNumber, body.workOrderNumber);
  assert.equal(await auditCount(), 1);
  assert.equal(await db.andonCall.count({
    where: { machineId, subtype: categoryId, status: "open" },
  }), 1);
  const machine = await db.machine.findUniqueOrThrow({
    where: { id: machineId },
  });
  assert.equal(machine.machineStatus, "stopped");
  assert.equal(machine.andonStatus, "open");
  assert.equal(machine.currentCallId, createdCallId);
  assert.equal(await db.callImpactInterval.count({
    where: { machineId, endedAt: null },
  }), 1);

  // A failing audit must roll back the call insert even under valid central
  // ACL. The test writes directly through the same transaction adapter.
  await assert.rejects(runCentralOpenCallWrite(db, {
    token, workstationId: stationId, machineId,
    body: { machineId, category: "maintenance", subtype: categoryId },
    ipAddress: "x".repeat(46),
  }, (tx, principal) => tx.andonCall.create({
    data: {
      machineId, category: "maintenance", subtype: categoryId,
      createdBy: principal.login, status: "open", criticality: "medium",
      openedAt: new Date(),
    },
  })));
  assert.equal(await db.andonCall.count({ where: { machineId } }), 1);

  process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "0";
  const disabled = await send();
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "1";

  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  assert.equal((await send()).statusCode, 401);
  assert.equal(await auditCount(), 1);
  console.log("SEC-04 individual opening PG PASS: OS, ACL, origin, scope, CSRF, duplicate race, stopped ownership, audit rollback, revoked session");
} finally {
  if (app) await app.close();
  if (previous.access === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previous.access;
  if (previous.flag === undefined) delete process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED;
  else process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = previous.flag;
  if (previous.origin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
  else process.env.ANDON_ACCESS_ORIGIN = previous.origin;
  await db.machine.update({
    where: { id: machineId },
    data: { currentCallId: null },
  }).catch(() => {});
  await db.callImpactInterval.deleteMany({ where: { machineId } });
  await db.failureEvent.deleteMany({ where: { machineId } });
  await db.andonCall.deleteMany({ where: { machineId } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.andonCategory.deleteMany({ where: { id: categoryId } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, otherMachineId] } } });
  await db.$disconnect();
}
