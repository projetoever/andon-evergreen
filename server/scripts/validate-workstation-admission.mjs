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
import { registerModuleRoutes } from "../dist/routes/modules.js";
import { registerWorkstationRoutes } from "../dist/routes/workstations.js";
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
const temp = mkdtempSync(join(tmpdir(), "andon-admission-tls-"));
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
const app = Fastify({ https: { cert, key: readFileSync(join(temp, "key.pem")) }, logger: false });
registerCorsSupport(app);
app.addHook("preHandler", enforceWorkstationAccess);
app.addHook("preHandler", enforceAdminAuthorization);
app.addHook("preHandler", enforceModuleAuthorization);
await registerAccessRoutes(app, db, origin);
await registerWorkstationRoutes(app);
await registerModuleRoutes(app);
app.route({
  url: "/api/admission-operational-fixture",
  method: ["GET", "PATCH"],
  handler: async () => ({ ok: true }),
});
app.get("/api/analytics/admission-fixture", async () => ({ ok: true }));
app.get("/api/dashboard-priority/admission-fixture", async () => ({ ok: true }));

const suffix = Date.now().toString(36);
const adminStation = `ws_${crypto.randomUUID()}`;
const pendingStation = `ws_${crypto.randomUUID()}`;
const rejectedStation = `ws_${crypto.randomUUID()}`;
const copiedStation = `ws_${crypto.randomUUID()}`;
const adminLogin = `admission.admin.${suffix}`;
const requesterLogin = `admission.requester.${suffix}`;
const adminPassword = "Admin admission isolated phrase";
const requesterPassword = "Requester admission isolated phrase";
let adminUser;
let requesterUser;
let machine;
let address;
let checks = 0;

async function request(client, stationId, path, method = "GET", body, expected = 200) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const response = await new Promise((resolve, reject) => {
    const req = httpsRequest(
      `${address}${path}`,
      {
        method,
        ca: cert,
        headers: {
          Origin: origin,
          "X-Andon-Workstation-Id": stationId,
          ...(client.cookie ? { Cookie: client.cookie } : {}),
          ...(client.csrf ? { "X-Andon-CSRF": client.csrf } : {}),
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

let previous;
try {
  previous = await db.systemSettings.findUnique({ where: { id: "global" } });
  await db.systemSettings.upsert({
    where: { id: "global" },
    create: { id: "global", hubEnabled: true, requireWorkstationApproval: true },
    update: { hubEnabled: true, requireWorkstationApproval: true },
  });
  machine = await db.machine.create({
    data: { id: `admission-${suffix}`, name: "Admission isolated machine" },
  });
  await db.workstation.createMany({
    data: [
      { id: adminStation, active: true, pendingApproval: false },
      { id: copiedStation, active: true, pendingApproval: false },
    ],
  });
  adminUser = await db.accessUser.create({
    data: {
      login: adminLogin,
      displayName: "Admission Admin",
      roleLabel: "Admin",
      isPrimaryAdmin: true,
      active: true,
      machineScope: "all",
      passwordHash: await hashAccessPassword(adminPassword),
      mustChangePassword: false,
    },
  });
  requesterUser = await db.accessUser.create({
    data: {
      login: requesterLogin,
      displayName: "Admission Requester",
      roleLabel: "Líder",
      active: true,
      machineScope: "all",
      passwordHash: await hashAccessPassword(requesterPassword),
      mustChangePassword: false,
      permissions: { create: [{ key: "andon.read" }, { key: "bi.read" }] },
      machines: { create: [{ machineId: machine.id }] },
    },
  });
  address = await app.listen({ host: "127.0.0.1", port: 0 });

  const registration = {};
  const registered = await request(
    registration,
    pendingStation,
    "/api/workstations/register",
    "POST",
    { id: pendingStation },
  );
  assert.equal(registered.pendingApproval, true);
  assert.equal(registered.active, false);

  const requester = {};
  await request(requester, pendingStation, "/api/access/session");
  const admissionLogin = await request(requester, pendingStation, "/api/access/login", "POST", {
    login: requesterLogin,
    password: requesterPassword,
  });
  assert.equal(admissionLogin.purpose, "workstation_admission");
  await request(requester, pendingStation, "/api/access/admission/request", "POST", {
    requestedName: "Kiosk Admission Test",
    reason: "Isolated validation",
  });
  const pending = await db.workstation.findUniqueOrThrow({
    where: { id: pendingStation },
    include: { admission: true },
  });
  assert.equal(pending.admission?.requesterUserId, requesterUser.id);
  assert.equal(pending.admission?.status, "pending");
  await request(
    requester,
    pendingStation,
    "/api/admission-operational-fixture",
    "GET",
    undefined,
    403,
  );

  const admin = {};
  await request(admin, adminStation, "/api/access/session");
  await request(admin, adminStation, "/api/access/login", "POST", {
    login: adminLogin,
    password: adminPassword,
  });

  const rejectedRequester = {};
  await request(rejectedRequester, rejectedStation, "/api/workstations/register", "POST", {
    id: rejectedStation,
  });
  await request(rejectedRequester, rejectedStation, "/api/access/session");
  await request(rejectedRequester, rejectedStation, "/api/access/login", "POST", {
    login: requesterLogin,
    password: requesterPassword,
  });
  await request(rejectedRequester, rejectedStation, "/api/access/admission/request", "POST", {
    requestedName: "Rejected isolated kiosk",
    reason: "Rejection validation",
  });
  await request(
    admin,
    adminStation,
    `/api/access/workstations/${rejectedStation}/decision`,
    "POST",
    {
      decision: "reject",
      reason: "Rejected in isolated validation",
      allowOperational: false,
      allowBi: false,
      allowPriorities: false,
    },
  );
  const rejected = await db.workstation.findUniqueOrThrow({
    where: { id: rejectedStation },
    include: { admission: true },
  });
  assert.equal(rejected.admission?.status, "rejected");
  assert.equal(rejected.active, false);
  await request(
    rejectedRequester,
    rejectedStation,
    "/api/access/login",
    "POST",
    { login: requesterLogin, password: requesterPassword },
    401,
  );

  const managed = await request(admin, adminStation, "/api/access/workstations");
  const listed = managed.find((item) => item.id === pendingStation);
  assert.equal(listed.linkedAccount.login, requesterLogin);
  assert.equal(listed.lastLogin.state, "workstation_blocked");
  await request(
    admin,
    adminStation,
    `/api/access/workstations/${pendingStation}/decision`,
    "POST",
    {
      decision: "approve",
      reason: "Approved for isolated validation",
      allowOperational: true,
      allowBi: true,
      allowPriorities: true,
    },
  );
  assert.equal((await request(requester, pendingStation, "/api/access/session")).principal, null);
  await request(requester, pendingStation, "/api/access/login", "POST", {
    login: requesterLogin,
    password: requesterPassword,
  });
  const moduleAccess = await request(requester, pendingStation, "/api/modules/access");
  assert.deepEqual(
    moduleAccess.modules
      .filter((item) => item.allowed)
      .map((item) => item.id)
      .sort(),
    ["bi", "operational"],
  );
  assert.deepEqual(moduleAccess.principal.machineIds, [machine.id]);
  await request(requester, pendingStation, "/api/admission-operational-fixture");
  await request(requester, pendingStation, "/api/analytics/admission-fixture");
  await request(requester, pendingStation, "/api/admission-operational-fixture", "PATCH", {}, 403);
  await db.accessUser.update({
    where: { id: requesterUser.id },
    data: { machineScope: "selected" },
  });
  const scopedModuleAccess = await request(requester, pendingStation, "/api/modules/access");
  assert.equal(
    scopedModuleAccess.modules.some((item) => item.allowed),
    false,
  );
  await request(
    requester,
    pendingStation,
    "/api/admission-operational-fixture",
    "GET",
    undefined,
    403,
  );
  await db.accessUser.update({
    where: { id: requesterUser.id },
    data: { machineScope: "all" },
  });
  await request(
    requester,
    pendingStation,
    "/api/dashboard-priority/admission-fixture",
    "GET",
    undefined,
    403,
  );
  await request(
    requester,
    copiedStation,
    "/api/admission-operational-fixture",
    "GET",
    undefined,
    401,
  );

  const session = await db.accessSession.findFirstOrThrow({
    where: { userId: requesterUser.id, workstationId: pendingStation, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  await db.accessSession.update({
    where: { id: session.id },
    data: { expiresAt: new Date(session.createdAt.getTime() + 1) },
  });
  await request(
    requester,
    pendingStation,
    "/api/analytics/admission-fixture",
    "GET",
    undefined,
    401,
  );
  await db.workstation.update({ where: { id: pendingStation }, data: { active: false } });
  await request(
    requester,
    pendingStation,
    "/api/analytics/admission-fixture",
    "GET",
    undefined,
    403,
  );
  const blocked = {};
  await request(blocked, pendingStation, "/api/access/session");
  await request(
    blocked,
    pendingStation,
    "/api/access/login",
    "POST",
    { login: requesterLogin, password: requesterPassword },
    401,
  );
  await db.workstation.update({ where: { id: pendingStation }, data: { active: true } });
  await db.accessUser.update({ where: { id: requesterUser.id }, data: { active: false } });
  await request(
    requester,
    pendingStation,
    "/api/analytics/admission-fixture",
    "GET",
    undefined,
    401,
  );

  const auditActions = await db.auditEvent.findMany({
    where: { resourceId: pendingStation },
    select: { action: true, actorUserId: true },
  });
  assert(
    auditActions.some(
      (event) =>
        event.action === "workstation.admission.requested" &&
        event.actorUserId === requesterUser.id,
    ),
  );
  assert(
    auditActions.some(
      (event) =>
        event.action === "workstation.admission.approved" && event.actorUserId === adminUser.id,
    ),
  );
  console.log(
    `Workstation admission integration PASS: ${checks} HTTPS assertions; pending, approval, module intersection, UUID binding, expiry, blocking and audit.`,
  );
} finally {
  // Audit is intentionally append-only, including in the isolated test schema.
  // Unique test identities keep retained evidence from colliding with later runs.
  if (adminUser)
    await db.accessUser.update({ where: { id: adminUser.id }, data: { isPrimaryAdmin: false } });
  await db.workstationAdmission.deleteMany({
    where: {
      workstationId: { in: [pendingStation, rejectedStation, adminStation, copiedStation] },
    },
  });
  await db.accessSession.deleteMany({
    where: {
      workstationId: { in: [pendingStation, rejectedStation, adminStation, copiedStation] },
    },
  });
  await db.accessPermission.deleteMany({
    where: { userId: { in: [adminUser?.id, requesterUser?.id].filter(Boolean) } },
  });
  await db.accessMachine.deleteMany({
    where: { userId: { in: [adminUser?.id, requesterUser?.id].filter(Boolean) } },
  });
  if (requesterUser) await db.accessUser.delete({ where: { id: requesterUser.id } });
  if (adminUser) await db.accessUser.delete({ where: { id: adminUser.id } });
  await db.workstation.deleteMany({
    where: { id: { in: [pendingStation, rejectedStation, adminStation, copiedStation] } },
  });
  if (machine) await db.machine.delete({ where: { id: machine.id } });
  if (previous)
    await db.systemSettings.update({
      where: { id: "global" },
      data: {
        hubEnabled: previous.hubEnabled,
        requireWorkstationApproval: previous.requireWorkstationApproval,
      },
    });
  await app.close();
  await db.$disconnect();
  rmSync(temp, { recursive: true, force: true });
}
