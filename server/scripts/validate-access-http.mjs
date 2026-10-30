import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { registerAccessRoutes } from "../dist/routes/access.js";
import { registerCorsSupport } from "../dist/config/cors.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { assertPermission } from "../dist/access/policy.js";
if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
)
  throw Error("Isolated andon_test required");
const db = new PrismaClient();
const temp = mkdtempSync(join(tmpdir(), "andon-access-tls-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(temp, "key.pem"),
    "-out",
    join(temp, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
const cert = readFileSync(join(temp, "cert.pem"));
const origin = "https://localhost:8443";
process.env.CORS_ORIGINS = origin;
const app = Fastify({ https: { cert, key: readFileSync(join(temp, "key.pem")) }, logger: false });
registerCorsSupport(app);
app.addHook("preHandler", enforceWorkstationAccess);
app.addHook("preHandler", enforceAdminAuthorization);
app.addHook("preHandler", enforceModuleAuthorization);
await registerAccessRoutes(app, db, origin);
const plain = Fastify({ logger: false });
await registerAccessRoutes(plain, db, origin);
const suffix = Date.now().toString(36);
const station = `ws_access_${suffix}`; // Replaced below with the existing UUID format.
const workstationId = `ws_${crypto.randomUUID()}`;
let adminId;
const oldSettings = await db.systemSettings.findUnique({ where: { id: "global" } });
let checks = 0;
async function call(client, path, method = "GET", body, status = 200, overrides = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise((resolve, reject) => {
    const request = httpsRequest(
      `${address}/api/access${path}`,
      {
        method,
        ca: cert,
        headers: {
          Origin: origin,
          "X-Andon-Workstation-Id": workstationId,
          ...(client.cookie ? { Cookie: client.cookie } : {}),
          ...(client.csrf ? { "X-Andon-CSRF": client.csrf } : {}),
          "Content-Type": "application/json",
          ...overrides,
        },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }),
        );
      },
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${response.data.error ?? "unexpected response"}`,
  );
  checks++;
  if (response.headers["set-cookie"]) {
    const header = response.headers["set-cookie"][0];
    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Path=\//);
    client.cookie = header.split(";")[0];
  }
  if (response.data.csrf) client.csrf = response.data.csrf;
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.data.token, undefined);
  return response.data;
}
let address;
try {
  await db.workstation.create({
    data: { id: workstationId, active: true, pendingApproval: false, allowOperational: false },
  });
  const hash = await hashCredential("Existing isolated Admin");
  await db.systemSettings.upsert({
    where: { id: "global" },
    create: { id: "global", adminPasswordHash: hash },
    update: { adminPasswordHash: hash },
  });
  const machine = await db.machine.create({
    data: { id: `access-http-${suffix}`, name: "Machine 37 isolated fixture" },
  });
  address = await app.listen({ host: "127.0.0.1", port: 0 });
  const insecure = await plain.inject({
    method: "GET",
    url: "/api/access/session",
    headers: { origin, "x-forwarded-proto": "https" },
  });
  assert.equal(insecure.statusCode, 426);
  checks++;
  const admin = {};
  const adminLogin = `owner.${suffix}`;
  assert.equal((await call(admin, "/session")).initialized, false);
  await call(admin, "/initialize", "POST", {
    currentPassword: "Existing isolated Admin",
    newPassword: "A6@rX2p!",
  }, 400);
  await call(admin, "/initialize", "POST", {
    login: "bad username",
    currentPassword: "Existing isolated Admin",
    newPassword: "A6@rX2p!",
  }, 400);
  await call(
    admin,
    "/initialize",
    "POST",
    { login: adminLogin, currentPassword: "123456", newPassword: "A6@rX2p!" },
    401,
  );
  await call(admin, "/initialize", "POST", {
    login: adminLogin,
    currentPassword: "Existing isolated Admin",
    newPassword: "Seven#7",
  }, 400);
  await call(admin, "/initialize", "POST", {
    login: adminLogin,
    currentPassword: "Existing isolated Admin",
    newPassword: "12345678",
  }, 400);
  await call(admin, "/initialize", "POST", {
    login: adminLogin,
    currentPassword: "Existing isolated Admin",
    newPassword: "Existing isolated Admin",
  }, 400);
  await call(admin, "/initialize", "POST", {
    login: adminLogin.toUpperCase(),
    currentPassword: "Existing isolated Admin",
    newPassword: "A6@rX2p!",
  });
  const a = (await call(admin, "/session")).principal;
  adminId = a.userId;
  assert.equal(a.isPrimaryAdmin, true);
  assert.equal(a.login, adminLogin); // Login is normalized, not forced to "admin".
  assert.equal(a.displayName, "Admin");
  assert.equal(
    (await db.systemSettings.findUnique({ where: { id: "global" } })).adminPasswordHash,
    hash, // Legacy secret is still preserved for isolated compatibility.
  );
  const legacyIsNotCentral = {};
  await call(legacyIsNotCentral, "/login", "POST", {
    login: adminLogin, password: "Existing isolated Admin",
  }, 401);
  assert.equal((await db.accessUser.count({ where: { isPrimaryAdmin: true } })), 1,
    "one primary Admin identity after enrollment");
  await call(
    admin,
    "/initialize",
    "POST",
    { login: "replacement.admin", currentPassword: "Existing isolated Admin", newPassword: "A6@rX2p!" },
    409,
  );
  await call(admin, "/catalog"); // No operational module grant required.
  const input = {
    login: `leader.${suffix}`,
    displayName: "Líder de Produção",
    roleLabel: "Admin",
    accountType: "person",
    active: true,
    machineScope: "selected",
    machineIds: [machine.id],
    permissions: ["calls.open"],
  };
  await call(admin, "/users", "POST", input, 403, { "X-Andon-CSRF": "bad" });
  await call(admin, "/users", "POST", input, 403, { Origin: "https://evil.example" });
  await call(admin, "/users", "POST", { ...input, isPrimaryAdmin: true }, 400);
  await call(admin, "/users", "POST", { ...input, machineIds: ["missing"] }, 400);
  const created = await call(admin, "/users", "POST", input);
  assert.match(created.temporaryPassword, /^[a-f0-9]{20}$/);
  await call(admin, "/users", "POST", input, 409);
  const listed = await call(admin, `/users?q=${encodeURIComponent(input.login)}`);
  assert.equal(listed.total, 1);
  assert.equal(listed.users[0].passwordHash, undefined);
  assert.equal(JSON.stringify(listed).includes(created.temporaryPassword), false);
  const person = {};
  await call(person, "/session");
  await call(person, "/users", "GET", undefined, 401);
  await call(person, "/login", "POST", { login: input.login, password: created.temporaryPassword });
  await call(person, "/users", "GET", undefined, 403);
  await call(person, "/password", "POST", { newPassword: "short" }, 400);
  await call(person, "/password", "POST", { newPassword: "My personal isolated phrase" });
  const p = (await call(person, "/session")).principal;
  assert.equal(p.purpose, "normal");
  assert.equal(p.isPrimaryAdmin, false);
  assertPermission(p, "calls.open", machine.id);
  assert.throws(() => assertPermission(p, "calls.open", "37"));
  assert.throws(() => assertPermission(p, "bi.read", machine.id));
  await call(person, "/users", "POST", { ...input, login: `other.${suffix}` }, 403);
  await call(
    person,
    `/users/${created.user.id}/reset`,
    "POST",
    { reason: "Escalation attempt" },
    403,
  );
  const other = {};
  await call(other, "/session");
  await call(
    other,
    "/login",
    "POST",
    { login: input.login, password: created.temporaryPassword },
    401,
  );
  await call(
    admin,
    `/users/${created.user.id}`,
    "PUT",
    { ...input, version: 1, permissions: ["bi.read"] },
    409,
  ); // first-login password change increments version
  const current = (await call(admin, `/users?q=${input.login}`)).users[0];
  await call(admin, `/users/${created.user.id}`, "PUT", {
    ...input,
    version: current.authorizationVersion,
    permissions: ["bi.read"],
  });
  assert.equal((await call(person, "/session")).principal, null);
  await call(person, "/login", "POST", {
    login: input.login,
    password: "My personal isolated phrase",
  });
  const current2 = (await call(admin, `/users?q=${input.login}`)).users[0];
  await call(admin, `/users/${created.user.id}`, "PUT", {
    ...input,
    active: false,
    version: current2.authorizationVersion,
  });
  await call(
    person,
    "/login",
    "POST",
    { login: input.login, password: "My personal isolated phrase" },
    401,
  );
  assert.equal((await call(person, "/session")).principal, null);
  const current3 = (await call(admin, `/users?q=${input.login}`)).users[0];
  await call(admin, `/users/${created.user.id}`, "PUT", {
    ...input,
    version: current3.authorizationVersion,
  });
  await db.accessSession.update({
    where: { id: a.sessionId },
    data: { createdAt: new Date(Date.now() - 6 * 60000) },
  });
  await call(
    admin,
    `/users/${created.user.id}/reset`,
    "POST",
    { reason: "Expired reauthentication" },
    401,
  );
  await call(admin, "/login", "POST", { login: adminLogin, password: "A6@rX2p!" });
  const reset = await call(admin, `/users/${created.user.id}/reset`, "POST", {
    reason: "Requested by user",
  });
  await call(person, "/login", "POST", { login: input.login, password: reset.temporaryPassword });
  const changeSession = (await call(person, "/session")).principal;
  await db.accessSession.update({
    where: { id: changeSession.sessionId },
    data: {
      createdAt: new Date(Date.now() - 3600000),
      lastInteractionAt: new Date(Date.now() - 3600000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await call(person, "/password", "POST", { newPassword: "Expired session password" }, 401);
  const kiosk = await call(admin, "/users", "POST", {
    ...input,
    login: `kiosk.${suffix}`,
    accountType: "kiosk",
    active: false,
  });
  assert.equal(kiosk.temporaryPassword, undefined);
  await call(
    admin,
    "/users",
    "POST",
    { ...input, login: `kiosk2.${suffix}`, accountType: "kiosk", active: true },
    400,
  );
  await call(admin, `/users/${adminId}`, "PUT", { ...input, version: 1 }, 403);
  await db.workstation.update({ where: { id: workstationId }, data: { pendingApproval: true } });
  await call(admin, "/users", "GET", undefined, 403);
  await db.workstation.update({ where: { id: workstationId }, data: { pendingApproval: false } });
  const events = await db.auditEvent.findMany({ where: { resourceId: created.user.id } });
  for (const action of [
    "access.user.created",
    "access.user.updated",
    "access.user.deactivated",
    "access.password.reset",
    "access.login",
    "access.password.changed",
  ])
    assert(
      events.some((e) => e.action === action),
      action,
    );
  const serialized = JSON.stringify(events);
  for (const secret of [
    created.temporaryPassword,
    reset.temporaryPassword,
    "My personal isolated phrase",
  ])
    assert.equal(serialized.includes(secret), false);
  assert(
    await db.auditEvent.count({
      where: { action: "access.request.denied", reason: "csrf_denied" },
    }),
  );
  const attacker = {};
  await call(attacker, "/session");
  let throttled = false;
  for (let i = 0; i < 12; i++) {
    const response = await new Promise((resolve, reject) => {
      const r = httpsRequest(
        `${address}/api/access/login`,
        {
          method: "POST",
          ca: cert,
          headers: {
            Origin: origin,
            Cookie: attacker.cookie,
            "X-Andon-CSRF": attacker.csrf,
            "X-Andon-Workstation-Id": workstationId,
            "Content-Type": "application/json",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode));
        },
      );
      r.on("error", reject);
      r.end(JSON.stringify({ login: "unknown-user", password: "invalid" }));
    });
    if (response === 429) {
      throttled = true;
      break;
    }
    assert.equal(response, 401);
  }
  assert(throttled);
  console.log(
    `Access HTTPS integration PASS: ${checks} HTTP assertions; PostgreSQL provisioning, CSRF, scope, first access, conflicts, expiry, reset, revocation, audit and throttling.`,
  );
} finally {
  if (adminId)
    await db.accessUser.update({
      where: { id: adminId },
      data: { isPrimaryAdmin: false, active: false },
    });
  await db.systemSettings.update({
    where: { id: "global" },
    data: { adminPasswordHash: oldSettings?.adminPasswordHash ?? null },
  });
  await app.close();
  await plain.close();
  await db.$disconnect();
  rmSync(temp, { recursive: true, force: true });
}
