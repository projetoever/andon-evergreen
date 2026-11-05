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
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Machine metadata integration requires CI /andon_test and central OFF");
const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-metadata-" + n;
const workstationId = "ws_" + randomUUID();
const login = "ci.machine." + n;
const token = randomBytes(32).toString("hex");
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, machineCreated = false, workstationCreated = false;
try {
  await db.machine.create({ data: {
    id: machineId, name: "Machine original", isActive: true,
    machineStatus: "running", andonStatus: "normal",
    requireWorkOrderAtOpen: false,
  } });
  machineCreated = true;
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  workstationCreated = true;
  const u = await db.accessUser.create({ data: {
    login, displayName: "CI machine-settings delegate", roleLabel: "Produção",
    accountType: "person", active: true, isPrimaryAdmin: false,
    machineScope: "selected", passwordHash: "CI unusable credential",
    mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }, { key: "andon.settings.open" }] },
  } });
  userId = u.id;
  const now = new Date();
  const s = await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId,
    purpose: "normal", authorizationVersion: u.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  sessionId = s.id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req =>
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true }));
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerMachineRoutes(app);
  const baseHeaders = {
    origin: "https://andon.test", "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (payload, extraHeaders = {}, path = "/api/machines/" + machineId) =>
    app.inject({
      method: "PATCH", url: path, headers: { ...baseHeaders, ...extraHeaders },
      payload,
    });
  const auditCount = () => db.auditEvent.count({
    where: { action: "andon.machine.metadata.update", resourceId: machineId },
  });
  const first = { name: "Machine updated via config", requireWorkOrderAtOpen: true };
  assert.equal((await send(first, { cookie: "" })).statusCode, 401);
  assert.equal((await send(first, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send({ machineStatus: "stopped" })).statusCode, 400);
  assert.equal((await send({ isActive: false })).statusCode, 400);
  assert.equal((await send({ productionMode: "not_scheduled" })).statusCode, 400);
  assert.equal(await auditCount(), 0);
  const good = await send(first);
  assert.equal(good.statusCode, 200, good.body);
  assert.equal(good.json().name, first.name);
  assert.equal(good.json().requireWorkOrderAtOpen, true);
  assert.equal(await auditCount(), 1);
  assert.equal((await send(first)).statusCode, 200);
  assert.equal(await auditCount(), 1, "identical metadata must not duplicate an audit");

  const current = await db.machine.findUniqueOrThrow({ where: { id: machineId } });
  assert.equal(current.machineStatus, "running");
  assert.equal(current.andonStatus, "normal");
  assert.equal(current.currentCallId, null);
  assert.equal(current.requireWorkOrderAtOpen, true);
  const event = await db.auditEvent.findFirstOrThrow({
    where: { action: "andon.machine.metadata.update", resourceId: machineId },
  });
  assert.equal(event.actorUserId, userId);
  assert.equal(event.before.values.name, "Machine original");
  assert.equal(event.after.values.name, first.name);
  assert(!JSON.stringify(event).includes(token), "credentials never appear in audit");

  // A deleted grant is effective on the very next request; no stale role or
  // in-memory permission can authorize a second metadata mutation.
  await db.accessPermission.deleteMany({
    where: { userId, key: "andon.settings.open" },
  });
  const denied = await send({ name: "MUST NOT SAVE" });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).name,
    first.name);
  assert.equal(await auditCount(), 1);

  process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "0";
  const disabled = await send({ name: "MUST NOT SAVE" });
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");
  console.log("R10-09 B1: central machine metadata, audit and grant revocation verified in PostgreSQL");
} finally {
  if (app) await app.close();
  // Audit records are append-only by database trigger. CI /andon_test is disposable;
  // never delete or rewrite evidence to clean up a fixture.
  if (sessionId) await db.accessSession.deleteMany({ where: { id: sessionId } });
  if (userId) {
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  if (workstationCreated) await db.workstation.deleteMany({ where: { id: workstationId } });
  if (machineCreated) await db.machine.deleteMany({ where: { id: machineId } });
  await db.$disconnect();
  for (const [key, value] of Object.entries({
    ANDON_CENTRAL_ACCESS_ENABLED: old.central,
    ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED: old.flag,
    ANDON_ACCESS_ORIGIN: old.origin,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
