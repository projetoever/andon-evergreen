import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, tokenHash } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerMachineRoutes } from "../dist/routes/machines.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1") {
  throw Error("REFINE 11 machine create PostgreSQL test is permitted only on isolated CI /andon_test with central OFF");
}
const db = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-r11-new-" + suffix;
const otherId = "ci-r11-denied-" + suffix;
const workstationId = "ws_" + randomUUID();
const login = "ci.r11.machine." + suffix;
const token = randomBytes(32).toString("hex");
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, workstationCreated = false;
try {
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false,
    allowOperational: true,
  } });
  workstationCreated = true;
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI REFINE11 machine catalog delegate", roleLabel: "Produção",
    accountType: "person", active: true, isPrimaryAdmin: false,
    machineScope: "selected", passwordHash: "CI unused password",
    mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }, { key: "andon.settings.open" }] },
  } });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  sessionId = session.id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async request =>
    Object.defineProperty(request.raw.socket, "encrypted",
      { value: true, configurable: true }));
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerMachineRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (payload, overwrite = {}) => app.inject({
    method: "POST", url: "/api/machines",
    headers: { ...headers, ...overwrite },
    payload,
  });
  const auditCount = () => db.auditEvent.count({
    where: { resourceId: machineId, action: "andon.machine.catalog.create" },
  });
  const body = {
    id: machineId, name: "  CI new machine  ",
    productionMode: "not_scheduled", requireWorkOrderAtOpen: true,
  };
  // Feature flag is OFF even when central login is ON.
  const disabled = await send(body);
  assert.equal(disabled.statusCode, 403, disabled.body);
  assert.equal(disabled.json().error, "central_action_not_supported");
  assert.equal(await db.machine.count({ where: { id: machineId } }), 0);

  process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "1";
  assert.equal((await send(body, { cookie: "" })).statusCode, 401);
  assert.equal((await send(body, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(body, { origin: "https://evil.example" })).statusCode, 403);
  for (const payload of [
    { ...body, isActive: false }, { ...body, machineStatus: "stopped" },
    { ...body, priorityOrder: 1 }, { ...body, currentCallId: "old" },
    { ...body, requireWorkOrderAtOpen: "true" },
    { id: "bad id" },
  ]) assert.equal((await send(payload)).statusCode, 400);
  assert.equal(await db.machine.count({ where: { id: machineId } }), 0);
  assert.equal(await auditCount(), 0);

  const result = await send(body);
  assert.equal(result.statusCode, 201, result.body);
  assert.equal(result.json().id, machineId);
  assert.equal(result.json().name, "CI new machine");
  assert.equal(result.json().productionMode, "not_scheduled");
  assert.equal(result.json().requireWorkOrderAtOpen, true);

  const created = await db.machine.findUniqueOrThrow({
    where: { id: machineId },
    include: { productionEvents: true, priorityHistory: true },
  });
  assert.equal(created.machineStatus, "running");
  assert.equal(created.andonStatus, "normal");
  assert.equal(created.currentCallId, null);
  assert.equal(created.isActive, true);
  assert.equal(created.productionEvents.length, 1);
  assert.equal(created.productionEvents[0].endedAt, null);
  assert.equal(created.priorityHistory.length, 1);
  assert.equal(created.priorityHistory[0].source, "machine_created");
  assert.equal(await auditCount(), 1);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { resourceId: machineId, action: "andon.machine.catalog.create" },
  });
  assert.equal(audit.actorUserId, userId);
  assert.equal(audit.after.name, "CI new machine");
  assert(!JSON.stringify(audit).includes(token), "no credentials in audit");

  // Duplicate must not change priority order, create child rows or audit again.
  const duplicate = await send(body);
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(duplicate.json().error, "machine_already_exists");
  assert.equal(await auditCount(), 1);
  assert.equal((await db.machinePriorityHistory.count({ where: { machineId } })), 1);
  assert.equal((await db.machineProductionEvent.count({ where: { machineId } })), 1);

  // Creation grant never grants control of existing machines/status or calls.
  const status = await app.inject({
    method: "PATCH", url: "/api/machines/" + machineId + "/status",
    headers, payload: { machineStatus: "stopped" },
  });
  assert.equal(status.statusCode, 403);
  const unchanged = await db.machine.findUniqueOrThrow({ where: { id: machineId } });
  assert.equal(unchanged.machineStatus, "running");

  // Revocation is effective immediately on the next request.
  await db.accessPermission.deleteMany({ where: { userId, key: "andon.settings.open" } });
  const revoked = await send({ id: otherId });
  assert.equal(revoked.statusCode, 403, revoked.body);
  assert.equal(await db.machine.count({ where: { id: otherId } }), 0);

  process.env.ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED = "0";
  const switchedOff = await send({ id: otherId });
  assert.equal(switchedOff.statusCode, 403);
  assert.equal(switchedOff.json().error, "central_action_not_supported");

  console.log("REFINE 11: machine create PASS — flag, TLS/Origin/CSRF, ACL, transaction, priority baseline, audit, duplicate, revocation, no physical write");
} finally {
  if (app) await app.close();
  // CI database is disposable. Audit rows are append-only and never modified.
  if (sessionId) await db.accessSession.deleteMany({ where: { id: sessionId } });
  if (userId) {
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  if (workstationCreated) await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.machinePriorityHistory.deleteMany({ where: { machineId } });
  await db.machineProductionEvent.deleteMany({ where: { machineId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.$disconnect();
  for (const [key, value] of Object.entries({
    ANDON_CENTRAL_ACCESS_ENABLED: old.central,
    ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED: old.flag,
    ANDON_ACCESS_ORIGIN: old.origin,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
