import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { registerAccessRoutes } from "../dist/routes/access.js";
import { registerIndustrialServiceAuthRoutes } from "../dist/routes/industrialServiceAuth.js";
import { registerMachineRoutes } from "../dist/routes/machines.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { registerSystemSettingsRoutes } from "../dist/routes/systemSettings.js";
import { registerCorsSupport } from "../dist/config/cors.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { hashAccessPassword } from "../dist/access/credentials.js";

if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test"
)
  throw Error("Isolated andon_test required");

const db = new PrismaClient();
const temp = mkdtempSync(join(tmpdir(), "andon-service-tls-"));
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
process.env.ANDON_ACCESS_ORIGIN = origin;
process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";

const app = Fastify({
  https: { cert, key: readFileSync(join(temp, "key.pem")) },
  logger: false,
});
registerCorsSupport(app);
app.addHook("preHandler", enforceWorkstationAccess);
app.addHook("preHandler", enforceAdminAuthorization);
app.addHook("preHandler", enforceModuleAuthorization);
await registerAccessRoutes(app, db, origin);
registerIndustrialServiceAuthRoutes(app, db);
await registerMachineRoutes(app);
await registerAndonCallRoutes(app);
await registerSystemSettingsRoutes(app);

const suffix = Date.now().toString(36);
const adminStation = `ws_${crypto.randomUUID()}`;
const adminLogin = `service.admin.${suffix}`;
const adminPassword = "Industrial service isolated admin phrase";
const machineId = `service-${suffix}`;
let adminUser;
let serviceId;
let previousSettings;
let previousOperationalCredential;
let address;
let checks = 0;

async function request(
  client,
  path,
  { method = "GET", body, expected = 200, browser = false, serviceToken } = {},
) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise((resolve, reject) => {
    const req = httpsRequest(
      `${address}${path}`,
      {
        method,
        ca: cert,
        headers: {
          ...(browser ? { Origin: origin, "X-Andon-Workstation-Id": adminStation } : {}),
          ...(client.cookie ? { Cookie: client.cookie } : {}),
          ...(client.csrf ? { "X-Andon-CSRF": client.csrf } : {}),
          ...(serviceToken ? { Authorization: `Bearer ${serviceToken}` } : {}),
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: text ? JSON.parse(text) : {},
          }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
  assert.equal(response.status, expected, `${method} ${path}: ${response.data.error ?? "failed"}`);
  checks++;
  if (response.headers["set-cookie"])
    client.cookie = response.headers["set-cookie"][0].split(";")[0];
  if (response.data.csrf) client.csrf = response.data.csrf;
  return response.data;
}

try {
  previousSettings = await db.systemSettings.findUnique({ where: { id: "global" } });
  previousOperationalCredential = await db.moduleCredential.findUnique({
    where: { id: "operational" },
  });
  await db.systemSettings.upsert({
    where: { id: "global" },
    create: { id: "global", hubEnabled: true, requireWorkstationApproval: false },
    update: { hubEnabled: true, requireWorkstationApproval: false },
  });
  await db.workstation.create({
    data: {
      id: adminStation,
      active: true,
      pendingApproval: false,
      allowOperational: true,
      allowBi: true,
      allowPriorities: true,
    },
  });
  await db.machine.create({ data: { id: machineId, name: "Service isolated machine" } });
  adminUser = await db.accessUser.create({
    data: {
      login: adminLogin,
      displayName: "Service Admin",
      roleLabel: "Admin",
      isPrimaryAdmin: true,
      active: true,
      machineScope: "all",
      passwordHash: await hashAccessPassword(adminPassword),
      mustChangePassword: false,
    },
  });
  address = await app.listen({ host: "127.0.0.1", port: 0 });

  const admin = {};
  await request(admin, "/api/access/session", { browser: true });
  await request(admin, "/api/access/login", {
    method: "POST",
    browser: true,
    body: { login: adminLogin, password: adminPassword },
  });
  const created = await request(admin, "/api/access/service-identities", {
    method: "POST",
    browser: true,
    body: {
      name: "Node-RED isolated",
      scopes: ["machines.read", "calls.read", "sound.read"],
      credentialTtlDays: 30,
      reason: "Isolated integration validation",
    },
  });
  serviceId = created.clientId;
  assert.match(created.clientSecret, /^andon-service-secret-v1\./);
  const stored = await db.industrialServiceIdentity.findUniqueOrThrow({ where: { id: serviceId } });
  assert.notEqual(stored.secretHash, created.clientSecret);
  assert.match(stored.secretHash, /^andon-scrypt-v1\$/);
  const listed = await request(admin, "/api/access/service-identities", { browser: true });
  assert.equal(listed[0].secretHash, undefined);
  assert.equal(listed[0].clientSecret, undefined);

  await db.moduleCredential.upsert({
    where: { id: "operational" },
    create: { id: "operational", passwordRequired: true, credentialVersion: 1 },
    update: { passwordRequired: true },
  });

  const service = {};
  const issued = await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: created.clientSecret },
  });
  assert.match(issued.accessToken, /^andon-service-v1\./);
  await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: `${created.clientSecret}-invalid` },
    expected: 401,
  });
  const firstToken = issued.accessToken;
  const machines = await request(service, "/api/machines", { serviceToken: firstToken });
  assert(machines.some((machine) => machine.id === machineId));
  assert(Array.isArray(await request(service, "/api/andon-calls", { serviceToken: firstToken })));
  await request(service, "/api/dashboard-sound-state", { serviceToken: firstToken });
  await request(service, "/api/dashboard-sound-state", {
    method: "PATCH",
    body: { muted: true },
    serviceToken: firstToken,
    expected: 403,
  });
  await request(service, "/api/andon-calls/history", {
    serviceToken: firstToken,
    expected: 403,
  });
  await request(service, "/api/machines", {
    serviceToken: `andon-service-v1.${"a".repeat(43)}`,
    expected: 401,
  });
  await request(service, "/api/machines", { expected: 403 });

  const blockedOperational = await request(admin, "/api/machines", {
    browser: true,
    expected: 401,
  });
  assert.equal(blockedOperational.error, "module_auth_required");

  const session = await db.industrialServiceSession.findUniqueOrThrow({
    where: { tokenHash: (await import("../dist/access/credentials.js")).tokenHash(firstToken) },
  });
  await db.industrialServiceSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await request(service, "/api/machines", { serviceToken: firstToken, expected: 401 });
  const renewed = await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: created.clientSecret },
  });
  await request(service, "/api/machines", { serviceToken: renewed.accessToken });
  await db.moduleCredential.update({
    where: { id: "operational" },
    data: { passwordRequired: false },
  });
  await request(admin, "/api/machines", { browser: true });
  await db.industrialServiceIdentity.update({
    where: { id: serviceId },
    data: { secretExpiresAt: new Date(Date.now() - 1) },
  });
  await request(service, "/api/machines", { serviceToken: renewed.accessToken, expected: 401 });
  await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: created.clientSecret },
    expected: 401,
  });

  const rotated = await request(admin, `/api/access/service-identities/${serviceId}/rotate`, {
    method: "POST",
    browser: true,
    body: { credentialTtlDays: 60, reason: "Scheduled isolated rotation" },
  });
  assert.notEqual(rotated.clientSecret, created.clientSecret);
  await request(service, "/api/machines", { serviceToken: renewed.accessToken, expected: 401 });
  await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: created.clientSecret },
    expected: 401,
  });
  const afterRotation = await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: rotated.clientSecret },
  });
  await request(service, "/api/machines", { serviceToken: afterRotation.accessToken });

  await request(admin, `/api/access/service-identities/${serviceId}/revoke`, {
    method: "POST",
    browser: true,
    body: { reason: "End isolated validation" },
  });
  await request(service, "/api/machines", {
    serviceToken: afterRotation.accessToken,
    expected: 401,
  });
  await request(service, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: rotated.clientSecret },
    expected: 401,
  });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  await request({}, "/api/machines");
  await request({}, "/api/service-auth/token", {
    method: "POST",
    body: { clientId: serviceId, clientSecret: rotated.clientSecret },
    expected: 404,
  });

  const actions = await db.auditEvent.findMany({
    where: { resourceId: serviceId },
    select: { action: true },
  });
  for (const action of [
    "industrial_service.created",
    "industrial_service.session.issued",
    "industrial_service.secret.rotated",
    "industrial_service.revoked",
  ])
    assert(
      actions.some((event) => event.action === action),
      action,
    );
  console.log(
    `Industrial service integration PASS: ${checks} HTTPS assertions; read scopes, renewal, rotation, revocation, browser and legacy compatibility.`,
  );
} finally {
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  if (serviceId) {
    await db.industrialServiceSession.deleteMany({ where: { serviceId } });
    await db.industrialServiceIdentity.deleteMany({ where: { id: serviceId } });
  }
  await db.accessSession.deleteMany({ where: { workstationId: adminStation } });
  if (adminUser)
    await db.accessUser.update({ where: { id: adminUser.id }, data: { isPrimaryAdmin: false } });
  if (adminUser) await db.accessUser.delete({ where: { id: adminUser.id } });
  await db.workstationAdmission.deleteMany({ where: { workstationId: adminStation } });
  await db.workstation.deleteMany({ where: { id: adminStation } });
  await db.machine.deleteMany({ where: { id: machineId } });
  if (previousSettings)
    await db.systemSettings.update({
      where: { id: "global" },
      data: {
        hubEnabled: previousSettings.hubEnabled,
        requireWorkstationApproval: previousSettings.requireWorkstationApproval,
      },
    });
  if (previousOperationalCredential)
    await db.moduleCredential.update({
      where: { id: "operational" },
      data: {
        username: previousOperationalCredential.username,
        passwordHash: previousOperationalCredential.passwordHash,
        passwordRequired: previousOperationalCredential.passwordRequired,
        credentialVersion: previousOperationalCredential.credentialVersion,
      },
    });
  else await db.moduleCredential.deleteMany({ where: { id: "operational" } });
  await app.close();
  await db.$disconnect();
  rmSync(temp, { recursive: true, force: true });
}
