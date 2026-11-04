import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { registerAdminAuthRoutes } from "../dist/routes/adminAuth.js";
import { enforceInitialAdminSetup } from "../dist/security/initialAdminSetupGuard.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { verifyAccessPassword } from "../dist/access/credentials.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test")
  throw Error("S1/6 bootstrap integration requires isolated /andon_test");

const previousMode = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
const previousCors = process.env.CORS_ORIGINS;
process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
process.env.CORS_ORIGINS = "https://localhost:8080";
const db = new PrismaClient();
let original = null;
let createdAdminId = null;
const app = Fastify({ logger: false });
app.addHook("onRequest", async (request) => {
  Object.defineProperty(request.raw.socket, "encrypted", { value: true, configurable: true });
});
app.addHook("preHandler", enforceInitialAdminSetup);
app.addHook("preHandler", enforceWorkstationAccess);
app.get("/api/first-run-test", async () => ({ ok: true }));

const request = (method, endpoint, payload, options = {}) =>
  app.inject({
    method, url: endpoint, remoteAddress: options.remoteAddress,
    headers: {
      host: "localhost:3001", origin: "https://localhost:8080",
      ...(options.headers ?? {}),
    },
    ...(payload === undefined ? {} : { payload }),
  });

try {
  const [accounts, stations] = await Promise.all([
    db.accessUser.count(), db.workstation.count(),
  ]);
  assert.equal(accounts, 0, "S1/6 test must run before any access user fixtures");
  assert.equal(stations, 0, "S1/6 test must run before any workstation fixtures");
  original = await db.systemSettings.findUnique({
    where: { id: "global" }, select: { adminPasswordHash: true },
  });
  await db.systemSettings.upsert({
    where: { id: "global" },
    create: { id: "global", adminPasswordHash: null },
    update: { adminPasswordHash: null },
  });
  await registerAdminAuthRoutes(app);
  const blocked = await request("GET", "/api/first-run-test");
  assert.equal(blocked.statusCode, 428, blocked.body);
  assert.equal(blocked.json().error, "initial_admin_setup_required");

  const status = await request("GET", "/api/admin-auth/status");
  assert.equal(status.statusCode, 200, status.body);
  assert.equal(status.json().passwordConfigured, false);
  assert.equal(status.json().centralFirstRun, true);
  assert.equal(status.json().setupAvailable, true);
  const token = status.json().setupToken;
  assert.match(token ?? "", /^[a-f0-9]{64}$/);

  const forbiddenGlobal = await request("POST", "/api/admin-auth/initialize",
    { setupToken: token, password: "WrongBootstrap#2026" });
  assert.equal(forbiddenGlobal.statusCode, 428, forbiddenGlobal.body);

  const remote = await request("POST", "/api/admin-auth/initialize-central",
    { setupToken: token, password: "OneAdmin#Safe2026" },
    { remoteAddress: "192.0.2.44" });
  assert.equal(remote.statusCode, 403, remote.body);
  const invalid = await request("POST", "/api/admin-auth/initialize-central",
    { setupToken: "0".repeat(64), password: "OneAdmin#Safe2026" });
  assert.equal(invalid.statusCode, 403, invalid.body);
  const weak = await request("POST", "/api/admin-auth/initialize-central",
    { setupToken: token, password: "12345678" });
  assert.equal(weak.statusCode, 400, weak.body);

  const result = await request("POST", "/api/admin-auth/initialize-central",
    { setupToken: token, password: "OneAdmin#Safe2026" });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().centralAccessInitialized, true);
  assert.equal(result.json().token, undefined);
  const [settings, primary] = await Promise.all([
    db.systemSettings.findUniqueOrThrow({ where: { id: "global" } }),
    db.accessUser.findFirstOrThrow({ where: { isPrimaryAdmin: true } }),
  ]);
  createdAdminId = primary.id;
  assert.equal(settings.adminPasswordHash, null,
    "Fresh central setup MUST NOT create another global Admin credential");
  assert.equal(primary.login, "admin");
  assert.equal(primary.mustChangePassword, false);
  assert.equal(await verifyAccessPassword("OneAdmin#Safe2026", primary.passwordHash), true);

  const after = await request("GET", "/api/admin-auth/status");
  assert.equal(after.json().passwordConfigured, true);
  assert.equal(after.json().centralFirstRun, false);
  assert.equal(after.json().setupToken, undefined);
  const reused = await request("POST", "/api/admin-auth/initialize-central",
    { setupToken: token, password: "OtherAdmin#Safe2026" });
  assert.equal(reused.statusCode, 403, reused.body);
  const stillLegacyDisabled = await request("POST", "/api/admin-auth/initialize",
    { setupToken: token, password: "OtherAdmin#Safe2026" });
  assert.equal(stillLegacyDisabled.statusCode, 403, stillLegacyDisabled.body);
  const privateAfter = await request("GET", "/api/first-run-test");
  assert.notEqual(privateAfter.statusCode, 428, "bootstrap guard must recognize central primary Admin");

  const audit = await db.auditEvent.findFirstOrThrow({
    where: { action: "access.admin.initialized.local", resourceId: primary.id },
    orderBy: { occurredAt: "desc" },
  });
  assert(!JSON.stringify(audit).includes("OneAdmin#Safe2026"));
  console.log("S1/6 central bootstrap: one human Admin, no legacy global password, no token, guarded local-only, audit PASS");
} finally {
  await app.close();
  if (createdAdminId) await db.accessUser.delete({ where: { id: createdAdminId } });
  if (original) await db.systemSettings.update({
    where: { id: "global" }, data: { adminPasswordHash: original.adminPasswordHash },
  });
  else await db.systemSettings.deleteMany({ where: { id: "global" } });
  if (previousMode === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousMode;
  if (previousCors === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = previousCors;
  await db.$disconnect();
}
