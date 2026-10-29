import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { runCentralPriorityOrderWrite } from "../dist/access/centralPriorityOrderWrite.js";
import { registerDashboardPriorityRoutes } from "../dist/routes/dashboardPriority.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("SEC-04 priority acceptance requires /andon_test, explicit opt-in and central OFF");
const db = new PrismaClient();
const contender = new PrismaClient();
const suffix = randomUUID().slice(0, 10);
const stationId = "ws_" + randomUUID();
const login = "priority.e2e." + suffix;
const token = randomBytes(32).toString("hex");
const machineId = "priority-e2e-" + suffix;
let userId, sessionId, createdHistory = [], createdMachines = [];
let originalPriorityConfig, originalOrders = [];
let app;
const request = (ids, options = {}, connection = db) =>
  runCentralPriorityOrderWrite(connection, { token, workstationId: stationId,
    machineIds: ids, requestId: "priority-" + suffix, ipAddress: "127.0.0.1", ...options });
const auditCount = () => db.auditEvent.count({
  where: { action: "priorities.write", resourceType: "priority_order",
    actorUserId: userId, resourceId: "global" },
});
try {
  originalPriorityConfig = await db.dashboardPriorityConfig.findUnique({
    where: { id: "global" },
  });
  originalOrders = await db.machine.findMany({
    select: { id: true, priorityOrder: true },
  });
  await db.machine.create({ data: { id: machineId, name: "Priority isolated PG" } });
  createdMachines.push(machineId);
  const station = await db.workstation.create({
    data: { id: stationId, active: true, pendingApproval: false,
      allowOperational: false, allowPriorities: true, allowBi: false },
  });
  const user = await db.accessUser.create({
    data: {
      login, displayName: "Priority e2e", roleLabel: "Manager",
      accountType: "person", isPrimaryAdmin: false, machineScope: "all",
      passwordHash: "test credential not used", mustChangePassword: false,
      permissions: { create: [{ key: "priorities.read" }, { key: "priorities.write" }] },
    },
  });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({
    data: {
      tokenHash: tokenHash(token), userId, workstationId: station.id,
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now, expiresAt: new Date(now.getTime() + 3600_000),
    },
  });
  sessionId = session.id;
  const base = (await db.machine.findMany({ select: { id: true } })).map(m => m.id);
  const reversed = [...base].reverse();
  const beforeAudit = await auditCount();

  await assert.rejects(request(reversed, { token: "0".repeat(64) }),
    (e) => e.code === "authentication_required");
  await db.accessPermission.delete({
    where: { userId_key: { userId, key: "priorities.write" } },
  });
  await assert.rejects(request(reversed), (e) => e.code === "permission_denied");
  await db.accessPermission.create({ data: { userId, key: "priorities.write" } });
  await db.accessUser.update({ where: { id: userId }, data: { machineScope: "selected" } });
  await assert.rejects(request(reversed), (e) => e.code === "scoped_query_required");
  await db.accessUser.update({ where: { id: userId }, data: { machineScope: "all" } });
  await assert.rejects(request([...reversed, "unknown"]), (e) => e.code === "priority_machine_catalog_changed");
  await assert.rejects(request(reversed, { ipAddress: "x".repeat(46) }),
    "failed audit must roll back machine and priority history");
  assert.equal(await auditCount(), beforeAudit);
  const afterRollback = await db.machine.findMany({ select: { id: true, priorityOrder: true } });
  assert.deepEqual(afterRollback.map(m => [m.id, m.priorityOrder]).sort(),
    [...originalOrders, { id: machineId, priorityOrder: null }]
      .map(m => [m.id, m.priorityOrder]).sort());

  const results = await Promise.all([
    request(reversed), request(base, {}, contender),
  ]);
  assert.equal(results.length, 2);
  assert(results.every(r => r.ok && r.lastOrderUpdatedBy === login));
  assert.equal(await auditCount(), beforeAudit + 2);
  createdHistory = await db.machinePriorityHistory.findMany({
    where: { changedBy: login }, select: { id: true },
  });
  assert.equal((await db.dashboardPriorityConfig.findUnique({
    where: { id: "global" },
  })).lastOrderUpdatedBy, login);

  // Real handler with TLS/origin + server-validated central cookie and CSRF.
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req =>
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true }));
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerDashboardPriorityRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (override = {}) => app.inject({
    method: "PUT", url: "/api/dashboard-priority/order", headers: { ...headers, ...override },
    payload: { machineIds: reversed },
  });
  const result = await send();
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(await auditCount(), beforeAudit + 3);
  const invalidCsrf = await send({ "x-andon-csrf": "0".repeat(64) });
  assert.equal(invalidCsrf.statusCode, 403);
  const unauthenticated = await send({ cookie: "" });
  assert.equal(unauthenticated.statusCode, 401);
  process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = "0";
  const disabled = await send();
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");

  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  await assert.rejects(request(base), (e) => e.code === "authentication_required");
  assert.equal(await auditCount(), beforeAudit + 3);
  console.log("SEC-04 priorities PostgreSQL PASS: ACL, scope, 2 clients, rollback, history, HTTP CSRF, gate-off and revocation");
} finally {
  if (app) await app.close();
  delete process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  delete process.env.ANDON_ACCESS_ORIGIN;
  if (userId) createdHistory = await db.machinePriorityHistory.findMany({
    where: { changedBy: login }, select: { id: true },
  });
  await db.$transaction(async tx => {
    for (const m of originalOrders)
      await tx.machine.update({ where: { id: m.id }, data: { priorityOrder: m.priorityOrder } });
    if (createdHistory.length)
      await tx.machinePriorityHistory.deleteMany({
        where: { id: { in: createdHistory.map(h => h.id) } },
      });
    if (originalPriorityConfig)
      await tx.dashboardPriorityConfig.update({
        where: { id: "global" },
        data: {
          lastOrderUpdatedAt: originalPriorityConfig.lastOrderUpdatedAt,
          lastOrderUpdatedBy: originalPriorityConfig.lastOrderUpdatedBy,
        },
      });
    else
      await tx.dashboardPriorityConfig.deleteMany({ where: { id: "global" } });
  });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  for (const id of createdMachines) await db.machine.deleteMany({ where: { id } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await contender.$disconnect();
  await db.$disconnect();
}
