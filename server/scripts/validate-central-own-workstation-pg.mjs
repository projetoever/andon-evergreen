import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerWorkstationRoutes } from "../dist/routes/workstations.js";
import { runCentralOwnWorkstationPreference } from "../dist/access/centralOwnWorkstationPrefs.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Workstation preference acceptance requires isolated /andon_test and central OFF");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const stationId = "ws_" + randomUUID(), foreignStation = "ws_" + randomUUID();
const machineId = "ci-preference-" + n, outsideMachine = "ci-preference-other-" + n;
const token = randomBytes(32).toString("hex"), login = "ci.pref." + n;
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId;
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI preference machine", isActive: true },
    { id: outsideMachine, name: "CI inaccessible machine", isActive: true },
  ] });
  await db.workstation.createMany({ data: [
    { id: stationId, active: true, pendingApproval: false, allowOperational: true },
    { id: foreignStation, active: true, pendingApproval: false, allowOperational: true },
  ] });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI preference user", roleLabel: "Produção",
    accountType: "person", machineScope: "selected", mustChangePassword: false,
    passwordHash: "test-only",
    permissions: { create: [{ key: "andon.read" }] },
    machines: { create: [{ machineId }] },
  } });
  userId = user.id;
  const now = new Date();
  sessionId = (await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3600000),
  } })).id;

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerWorkstationRoutes(app);

  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const route = "/api/workstations/" + stationId;
  const inject = (method, path, body, extra = {}) => app.inject({
    method, url: path, headers: { ...headers, ...extra },
    ...(body === undefined ? {} : { payload: body }),
  });
  const lock = (id = machineId, workstation = stationId, extra = {}) =>
    inject("PATCH", "/api/workstations/" + workstation + "/screen-lock",
      { machineId: id }, extra);
  const sound = (enabled, id = machineId, workstation = stationId, extra = {}) =>
    inject("PUT", "/api/workstations/" + workstation + "/machine-sound/" + id,
      { enabled }, extra);
  const audit = action => db.auditEvent.count({
    where: { action, resourceType: "workstation", resourceId: stationId },
  });

  assert.equal((await inject("GET", route + "/runtime-preferences")).statusCode, 200);
  assert.equal((await inject("GET",
    "/api/workstations/" + foreignStation + "/runtime-preferences")).statusCode, 403);
  assert.equal((await lock(machineId, foreignStation)).statusCode, 403);
  assert.equal((await sound(true, machineId, foreignStation)).statusCode, 403);
  assert.equal((await lock(outsideMachine)).statusCode, 403);
  assert.equal((await sound(true, outsideMachine)).statusCode, 403);
  assert.equal((await lock(machineId, stationId, { cookie: "" })).statusCode, 401);
  assert.equal((await lock(machineId, stationId,
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await inject("PATCH", route + "/screen-lock",
    { machineId, active: true })).statusCode, 400);
  assert.equal((await inject("PUT", route + "/machine-sound/" + machineId,
    { enabled: "true" })).statusCode, 400);
  assert.equal(await audit("workstation.screen.lock"), 0);
  assert.equal(await audit("workstation.sound.preference"), 0);

  // One user cannot change another workstation; an audit insertion failure
  // rolls back preference mutation even when the payload is otherwise valid.
  await assert.rejects(runCentralOwnWorkstationPreference(db, {
    token, workstationId: stationId, targetWorkstationId: stationId,
    change: { type: "screen-lock", machineId }, ipAddress: "x".repeat(46),
  }));
  assert.equal((await db.workstation.findUniqueOrThrow({
    where: { id: stationId },
  })).lockedMachineId, null);
  assert.equal(await audit("workstation.screen.lock"), 0);

  const fixed = await lock();
  assert.equal(fixed.statusCode, 200, fixed.body);
  assert.equal(fixed.json().lockedMachineId, machineId);
  assert.equal(await audit("workstation.screen.lock"), 1);
  assert.equal((await lock()).statusCode, 200);
  assert.equal(await audit("workstation.screen.lock"), 1, "replay has no duplicate audit");

  const enabled = await sound(false);
  assert.equal(enabled.statusCode, 200, enabled.body);
  assert.equal(enabled.json().enabled, false);
  assert.equal(await audit("workstation.sound.preference"), 1);
  assert.equal((await sound(false)).statusCode, 200);
  assert.equal(await audit("workstation.sound.preference"), 1);
  const runtime = await inject("GET", route + "/runtime-preferences");
  assert.equal(runtime.statusCode, 200, runtime.body);
  assert.equal(runtime.json().machineSoundPreferences[machineId], false);

  const released = await lock(null);
  assert.equal(released.statusCode, 200, released.body);
  assert.equal(released.json().lockedMachineId, null);
  assert.equal(await audit("workstation.screen.lock"), 2);

  process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "0";
  assert.equal((await lock()).statusCode, 403);
  assert.equal((await inject("GET", route + "/runtime-preferences")).statusCode, 403);
  process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  assert.equal((await lock()).statusCode, 401);

  console.log("SEC-04 own workstation preferences PG PASS: self-only, machine scope, CSRF, no-op, audit rollback, central OFF and revocation");
} finally {
  if (app) await app.close();
  for (const [key, env] of [
    ["central", "ANDON_CENTRAL_ACCESS_ENABLED"],
    ["flag", "ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED"],
    ["origin", "ANDON_ACCESS_ORIGIN"],
  ]) {
    if (old[key] === undefined) delete process.env[env];
    else process.env[env] = old[key];
  }
  await db.workstationMachineSoundPreference.deleteMany({
    where: { workstationId: { in: [stationId, foreignStation] } },
  });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
  }
  await db.workstation.deleteMany({ where: { id: { in: [stationId, foreignStation] } } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, outsideMachine] } } });
  await db.$disconnect();
}
