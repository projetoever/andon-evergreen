import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerSystemSettingsRoutes } from "../dist/routes/systemSettings.js";
import { runCentralOperationalSettingsUpdate } from "../dist/access/centralOperationalSettings.js";

// R12-04G1: inspect/change only disposable CI PostgreSQL /andon_test. Never
// install this integration script or test flags on factory or user's HML DB.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED === "1")
  throw Error("R12-04G1 requires isolated /andon_test with central flags initially OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const stationId = "ws_" + randomUUID();
const token = randomBytes(32).toString("hex");
const login = "ci.04g1.audio." + n;
const old = {
  access: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
const oldSettings = await db.systemSettings.findUnique({ where: { id: "global" } });
let userId;
let app;
try {
  await db.systemSettings.upsert({ where: { id: "global" },
    update: {}, create: { id: "global" } });
  await db.workstation.create({ data: {
    id: stationId, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI Sound settings Production", roleLabel: "Produção",
    accountType: "person", isPrimaryAdmin: false, active: true,
    machineScope: "selected", passwordHash: "CI no password",
    mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "andon.settings.open" },
    ] },
  } });
  userId = user.id;
  const now = new Date();
  await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerSystemSettingsRoutes(app);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (body, extra = {}, path = "/api/system-settings") =>
    app.inject({ method: "PATCH", url: path,
      headers: { ...headers, ...extra }, payload: body });
  const audits = () => db.auditEvent.findMany({
    where: { action: "system.operational_settings.update", actorUserId: userId },
  });
  const before = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  const patch = {
    dashboardSoundMuteTimerEnabled: !before.dashboardSoundMuteTimerEnabled,
    dashboardSoundMuteDurationMinutes:
      before.dashboardSoundMuteDurationMinutes === 6 ? 8 : 6,
    dashboardSoundAutoMuteTimerEnabled: !before.dashboardSoundAutoMuteTimerEnabled,
    dashboardSoundActiveDurationMinutes:
      before.dashboardSoundActiveDurationMinutes === 7 ? 9 : 7,
  };

  const blocked = await send(patch);
  assert.equal(blocked.statusCode, 403, blocked.body);
  assert.equal(blocked.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
  assert.equal((await send(patch, { cookie: "" })).statusCode, 401);
  assert.equal((await send(patch,
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(patch,
    { origin: "https://evil.invalid" })).statusCode, 403);
  for (const invalid of [
    { dashboardSoundMuted: true },
    { dashboardSoundMuteDurationMinutes: 0 },
    { dashboardSoundActiveDurationMinutes: 241 },
    { dashboardSoundMuteDurationMinutes: "5" },
    { dashboardSoundMuteTimerEnabled: "true" },
    { dashboardSoundAutoMuteTimerEnabled: 1 },
    { gpioSirenMuted: true },
    { clientName: "OK", adminPasswordHash: "spoof" },
  ]) assert.equal((await send(invalid)).statusCode, 400);
  // Actual runtime mute is a separate call and is not delegated to config.
  assert.equal((await send({ muted: true }, {},
    "/api/dashboard-sound-state")).statusCode, 403);
  assert.equal((await audits()).length, 0);

  // Fail append-only audit after the setting UPDATE to verify PG rollback.
  await assert.rejects(runCentralOperationalSettingsUpdate(db, {
    token, workstationId: stationId, patch, ipAddress: "x".repeat(46),
  }));
  const rolledBack = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  for (const key of Object.keys(patch)) assert.equal(rolledBack[key], before[key]);
  assert.equal((await audits()).length, 0);

  const done = await send(patch);
  assert.equal(done.statusCode, 200, done.body);
  for (const [key, value] of Object.entries(patch))
    assert.equal(done.json()[key], value);
  assert.equal((await audits()).length, 1);
  const audit = (await audits())[0];
  assert.equal(audit.actorUserId, userId);
  assert.equal(audit.workstationId, stationId);
  assert.deepEqual(new Set(audit.after.changedKeys), new Set(Object.keys(patch)));
  const after = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  assert.equal(after.dashboardSoundMuted, before.dashboardSoundMuted);
  assert.equal(after.dashboardSoundMutedAt?.getTime() ?? null,
    before.dashboardSoundMutedAt?.getTime() ?? null);
  assert.equal(after.dashboardSoundMuteReason, before.dashboardSoundMuteReason);
  assert(!JSON.stringify(audit).includes(token));

  // Idempotent replay does not re-log a no-op. Revocation immediately denies.
  assert.equal((await send(patch)).statusCode, 200);
  assert.equal((await audits()).length, 1);
  await db.accessPermission.deleteMany({
    where: { userId, key: "andon.settings.open" },
  });
  assert.equal((await send(patch)).statusCode, 403);
  process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
  assert.equal((await send(patch)).statusCode, 403);

  console.log("R12-04G1 browser-sound timer PG PASS: delegated Production selected global config, 4 fields, flag OFF, CSRF/Origin, strict ranges, no GPIO/runtime mute, atomic audit rollback, idempotence and revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", old.access);
  restore("ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED", old.flag);
  restore("ANDON_ACCESS_ORIGIN", old.origin);
  if (oldSettings) {
    await db.systemSettings.update({ where: { id: "global" }, data: {
      dashboardSoundMuteTimerEnabled: oldSettings.dashboardSoundMuteTimerEnabled,
      dashboardSoundMuteDurationMinutes: oldSettings.dashboardSoundMuteDurationMinutes,
      dashboardSoundAutoMuteTimerEnabled: oldSettings.dashboardSoundAutoMuteTimerEnabled,
      dashboardSoundActiveDurationMinutes: oldSettings.dashboardSoundActiveDurationMinutes,
    } });
  }
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.$disconnect();
}
