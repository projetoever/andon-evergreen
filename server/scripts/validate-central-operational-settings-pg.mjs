import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerSystemSettingsRoutes } from "../dist/routes/systemSettings.js";
import { runCentralOperationalSettingsUpdate } from "../dist/access/centralOperationalSettings.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Central settings E2E only runs on isolated /andon_test with central OFF");

const db = new PrismaClient();
const id = randomUUID(), workstationId = "ws_" + id;
const token = randomBytes(32).toString("hex");
const login = "ci.settings." + id.replaceAll("-", "").slice(0, 12);
const oldEnv = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, original;
try {
  original = await db.systemSettings.findUnique({ where: { id: "global" } });
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI global operational settings", roleLabel: "Admin",
    isPrimaryAdmin: true, accountType: "person", machineScope: "all",
    passwordHash: "no-human-login", mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }] },
  } });
  userId = user.id;
  const now = new Date();
  sessionId = (await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3600000),
  } })).id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async request => {
    Object.defineProperty(request.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerSystemSettingsRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (body, override = {}) =>
    app.inject({ method: "PATCH", url: "/api/system-settings",
      headers: { ...headers, ...override }, payload: body });
  const auditCount = () => db.auditEvent.count({
    where: { action: "system.operational_settings.update",
      resourceType: "system_settings", resourceId: "global",
      actorLogin: login },
  });
  const before = await db.systemSettings.findUnique({ where: { id: "global" } });
  const newName = "CI Evergreen " + id.slice(0, 8);

  assert.equal((await send({ requireWorkOrderAtOpen: true }, { cookie: "" })).statusCode, 401);
  assert.equal((await send({ requireWorkOrderAtOpen: true },
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send({ dashboardSoundMuted: true })).statusCode, 400);
  assert.equal((await send({ dashboardSoundMuteTimerEnabled: true })).statusCode, 400);
  assert.equal((await send({ attendanceMode: "name" })).statusCode, 400);
  assert.equal((await send({ hubEnabled: false })).statusCode, 400);
  assert.equal(await auditCount(), 0);

  await db.accessUser.update({ where: { id: userId },
    data: { isPrimaryAdmin: false } });
  assert.equal((await send({ clientName: newName })).statusCode, 403);
  await db.accessUser.update({ where: { id: userId },
    data: { isPrimaryAdmin: true, machineScope: "selected" } });
  // Even selected-machine users need these safe, public reads for the
  // PIN/RFID modal and the current dashboard's muted-state indicator.
  assert.equal((await app.inject({ method: "GET", url: "/api/system-settings",
    headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/api/dashboard-sound-state",
    headers })).statusCode, 200);
  assert.equal((await send({ clientName: newName })).statusCode, 403);
  await db.accessUser.update({ where: { id: userId },
    data: { isPrimaryAdmin: true, machineScope: "all" } });
  assert.equal(await auditCount(), 0);

  // Break atomic audit insert after the settings update to verify full rollback.
  await assert.rejects(runCentralOperationalSettingsUpdate(db, {
    token, workstationId, patch: { clientName: newName }, ipAddress: "x".repeat(46),
  }));
  assert.equal((await db.systemSettings.findUnique({ where: { id: "global" } }))
    ?.clientName, before?.clientName ?? "Evergreen");
  assert.equal(await auditCount(), 0);

  const changed = await send({ clientName: newName,
    requireWorkOrderAtOpen: !(before?.requireWorkOrderAtOpen ?? false) });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().clientName, newName);
  assert.equal(await auditCount(), 1);
  const detail = await db.auditEvent.findFirstOrThrow({
    where: { action: "system.operational_settings.update", actorLogin: login },
  });
  assert.equal(detail.actorLogin, login);
  assert.equal(detail.workstationId, workstationId);
  assert(!JSON.stringify(detail).includes(token));
  const replay = await send({ clientName: newName,
    requireWorkOrderAtOpen: !(before?.requireWorkOrderAtOpen ?? false) });
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(await auditCount(), 1, "identical settings must not duplicate audit");

  const after = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  assert.equal(after.dashboardSoundMuted, before?.dashboardSoundMuted ?? false,
    "global sound and siren state must not change");

  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
  assert.equal((await send({ clientName: "No change" })).statusCode, 403);
  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  assert.equal((await send({ clientName: "No change" })).statusCode, 401);
  console.log("SEC-04 central ops settings PASS: Admin+full scope, CSRF, strict whitelist, rollback, audit, no-op, revocation");
} finally {
  if (app) await app.close();
  for (const [key, env] of [
    ["central", "ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag", "ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED"],
    ["origin", "ANDON_ACCESS_ORIGIN"],
  ]) {
    if (oldEnv[key] === undefined) delete process.env[env];
    else process.env[env] = oldEnv[key];
  }
  // Restore only the two test fields; never write over unrelated settings.
  if (original) await db.systemSettings.update({
    where: { id: "global" },
    data: { clientName: original.clientName,
      requireWorkOrderAtOpen: original.requireWorkOrderAtOpen },
  });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId },
      data: { active: false, isPrimaryAdmin: false } });
  }
  await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.$disconnect();
}
