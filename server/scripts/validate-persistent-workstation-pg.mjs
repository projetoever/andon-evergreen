import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { hashAccessPassword, tokenHash, csrfToken } from "../dist/access/credentials.js";
import { resolveSession } from "../dist/access/sessions.js";
import { registerAccessRoutes } from "../dist/routes/access.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";

const u = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    process.env.NODE_ENV !== "test" || u.pathname !== "/andon_test" ||
    !["127.0.0.1", "localhost"].includes(u.hostname))
  throw Error("Persistent station acceptance requires isolated local /andon_test");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-persistent-machine-" + n;
const adminStationId = "ws_" + randomUUID();
const targetStationId = "ws_" + randomUUID();
const adminToken = randomBytes(32).toString("hex");
const operatorPassword = "Only-for-local-CI#2026";
let app, adminUserId, operatorUserId;
const oldEnv = { central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN };
try {
  await db.machine.create({ data: { id: machineId, name: "Persistent operation CI", isActive: true } });
  await db.workstation.createMany({ data: [
    { id: adminStationId, active: true, pendingApproval: false, allowOperational: true },
    { id: targetStationId, active: true, pendingApproval: false,
      allowOperational: true, lockedMachineId: machineId },
  ] });
  const admin = await db.accessUser.create({ data: {
    login: "ci.admin.persistent." + n, displayName: "CI Admin",
    roleLabel: "Admin", accountType: "person", isPrimaryAdmin: true,
    active: true, mustChangePassword: false, machineScope: "all",
    passwordHash: await hashAccessPassword("CI-Admin-Only#2026"),
  } });
  adminUserId = admin.id;
  const operator = await db.accessUser.create({ data: {
    login: "ci.operator.persistent." + n, displayName: "CI Production",
    roleLabel: "Produção", accountType: "person", active: true,
    mustChangePassword: false, machineScope: "selected",
    passwordHash: await hashAccessPassword(operatorPassword),
    permissions: { create: [{ key: "andon.read" }, { key: "calls.open" }] },
    machines: { create: [{ machineId }] },
  } });
  operatorUserId = operator.id;
  const now = new Date();
  await db.accessSession.create({ data: {
    tokenHash: tokenHash(adminToken), userId: admin.id,
    workstationId: adminStationId, purpose: "normal", authorizationVersion: admin.authorizationVersion,
    lastAuthenticatedAt: now,
    expiresAt: new Date(now.getTime() + 3600_000),
  } });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAccessRoutes(app, db, "https://andon.test");
  const request = async (method, path, cookie, workstationId, csrf, payload) => app.inject({
    method, url: "/api/access" + path,
    headers: {
      origin: "https://andon.test",
      "x-andon-workstation-id": workstationId,
      cookie: "__Host-andon-access=" + cookie,
      ...(csrf ? { "x-andon-csrf": csrfToken(cookie) } : {}),
    },
    ...(payload === undefined ? {} : { payload }),
  });
  const adminRequest = (method, path, payload) =>
    request(method, path, adminToken, adminStationId, method !== "GET", payload);
  const stationPath = "/workstations/" + targetStationId;

  // Defaults OFF; ordinary account must expire normally.
  assert.equal((await db.workstation.findUniqueOrThrow({
    where: { id: targetStationId },
  })).allowPersistentOperationalLogin, false);
  const on = await adminRequest("PATCH", stationPath, { allowPersistentOperationalLogin: true });
  assert.equal(on.statusCode, 200, on.body);
  const loginToken = randomBytes(32).toString("hex");
  const login = await app.inject({
    method: "POST", url: "/api/access/login",
    headers: {
      origin: "https://andon.test", "x-andon-workstation-id": targetStationId,
      cookie: "__Host-andon-preauth=" + loginToken,
      "x-andon-csrf": csrfToken(loginToken),
    },
    payload: { login: operator.login, password: operatorPassword },
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json().persistentOperational, true);
  const cookie = login.headers["set-cookie"];
  assert.match(String(cookie), /HttpOnly; Secure; SameSite=Strict/);
  const token = String(cookie).match(/__Host-andon-access=([a-f0-9]{64})/)?.[1];
  assert(token, "secure persistent login cookie must be issued");

  // Server explicitly ignores absolute and idle age for authorized operations.
  const s = await db.accessSession.findFirstOrThrow({
    where: { tokenHash: tokenHash(token) },
  });
  await db.accessSession.update({ where: { id: s.id }, data: {
    expiresAt: new Date("2025-01-01T00:00:00Z"),
    lastInteractionAt: new Date("2025-01-01T00:00:00Z"),
  } });
  const persisted = await resolveSession(db, { token, workstationId: targetStationId });
  assert.equal(persisted.persistentOperational, true);
  assert.deepEqual(persisted.machineIds, [machineId]);

  // A non-admin cannot remotely log out their own or another workstation.
  const selfDenied = await request("POST", stationPath + "/remote-logout", token,
    targetStationId, true, { reason: "Not authorized" });
  assert.notEqual(selfDenied.statusCode, 200);

  const logout = await adminRequest("POST", stationPath + "/remote-logout",
    { reason: "Operator shift handoff" });
  assert.equal(logout.statusCode, 200, logout.body);
  assert(logout.json().revokedSessions > 0);
  await assert.rejects(resolveSession(db, { token, workstationId: targetStationId }));

  const reLogin = await app.inject({ method: "POST", url: "/api/access/login",
    headers: { origin: "https://andon.test", "x-andon-workstation-id": targetStationId,
      cookie: "__Host-andon-preauth=" + loginToken, "x-andon-csrf": csrfToken(loginToken) },
    payload: { login: operator.login, password: operatorPassword },
  });
  assert.equal(reLogin.statusCode, 200, reLogin.body);
  const renewed = String(reLogin.headers["set-cookie"])
    .match(/__Host-andon-access=([a-f0-9]{64})/)?.[1];
  assert(renewed);

  // Admin turning trust OFF immediately revokes all persistent sessions.
  const off = await adminRequest("PATCH", stationPath, { allowPersistentOperationalLogin: false });
  assert.equal(off.statusCode, 200, off.body);
  await assert.rejects(resolveSession(db, { token: renewed, workstationId: targetStationId }));
  assert.equal((await db.workstation.findUniqueOrThrow({
    where: { id: targetStationId },
  })).allowPersistentOperationalLogin, false);
  assert.equal(await db.auditEvent.count({
    where: { action: "workstation.session.remote_logout", resourceId: targetStationId },
  }), 1);
  process.stdout.write("REFINE15 persistent station + remote logout PG PASS\n");
} finally {
  if (app) await app.close();
  if (oldEnv.central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldEnv.central;
  if (oldEnv.origin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
  else process.env.ANDON_ACCESS_ORIGIN = oldEnv.origin;
  if (adminUserId || operatorUserId) {
    const ids = [adminUserId, operatorUserId].filter(Boolean);
    await db.accessSession.deleteMany({ where: { userId: { in: ids } } });
    await db.accessPermission.deleteMany({ where: { userId: { in: ids } } });
    await db.accessMachine.deleteMany({ where: { userId: { in: ids } } });
    if (adminUserId) await db.accessUser.update({
      where: { id: adminUserId }, data: { isPrimaryAdmin: false, active: false },
    });
    if (operatorUserId) await db.accessUser.update({
      where: { id: operatorUserId }, data: { active: false },
    });
  }
  await db.workstation.deleteMany({ where: { id: { in: [adminStationId, targetStationId] } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.$disconnect();
}
