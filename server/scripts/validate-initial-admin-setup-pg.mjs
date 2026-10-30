import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { registerAdminAuthRoutes, verifyAdminPassword } from "../dist/routes/adminAuth.js";
import { verifyCredential } from "../dist/security/technicianCredentials.js";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || databaseUrl.pathname !== "/andon_test")
  throw Error("Initial Admin bootstrap test requires isolated /andon_test");

const db = new PrismaClient();
const savedCors = process.env.CORS_ORIGINS;
process.env.CORS_ORIGINS = "http://localhost:8080";
let original = null;
const app = Fastify({ logger: false });
const originalHashIsNotKnown = "123456";
try {
  original = await db.systemSettings.findUnique({
    where: { id: "global" }, select: { adminPasswordHash: true },
  });
  await db.systemSettings.upsert({
    where: { id: "global" },
    update: { adminPasswordHash: null },
    create: { id: "global", adminPasswordHash: null },
  });
  await registerAdminAuthRoutes(app);
  const req = (method, path, payload, options = {}) => app.inject({
    method, url: path, ...options,
    headers: { host: "localhost:3001", origin: "http://localhost:8080",
      ...(options.headers ?? {}) },
    ...(payload ? { payload } : {}),
  });
  const status = await req("GET", "/api/admin-auth/status");
  assert.equal(status.statusCode, 200, status.body);
  const state = status.json();
  assert.equal(state.passwordConfigured, false);
  assert.equal(state.setupAvailable, true);
  assert.match(state.setupToken ?? "", /^[a-f0-9]{64}$/);

  const remote = await req("GET", "/api/admin-auth/status", undefined,
    { remoteAddress: "192.0.2.55" });
  assert.equal(remote.json().setupAvailable, false);
  assert.equal(remote.json().setupToken, null);
  const spoofedHost = await req("GET", "/api/admin-auth/status", undefined,
    { headers: { host: "192.0.2.55:3001" } });
  assert.equal(spoofedHost.json().setupAvailable, false);
  assert.equal(spoofedHost.json().setupToken, null);
  assert.equal(await verifyAdminPassword(originalHashIsNotKnown), false,
    "No hardcoded default must authenticate when database has no password");
  const oldLogin = await req("POST", "/api/admin-auth/login",
    { username: "admin", password: originalHashIsNotKnown });
  assert.equal(oldLogin.statusCode, 401);

  const badToken = await req("POST", "/api/admin-auth/initialize",
    { setupToken: "0".repeat(64), password: "A6@rX2p!" });
  assert.equal(badToken.statusCode, 403);
  const badOrigin = await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "A6@rX2p!" },
    { headers: { origin: "http://evil.test:8080" } });
  assert.equal(badOrigin.statusCode, 403);
  const badRemote = await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "A6@rX2p!" },
    { remoteAddress: "192.0.2.55" });
  assert.equal(badRemote.statusCode, 403);
  assert.equal((await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "Seven#7" })).statusCode, 400);
  assert.equal((await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "12345678" })).statusCode, 400);

  const saved = await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "A6@rX2p!" });
  assert.equal(saved.statusCode, 200, saved.body);
  const settings = await db.systemSettings.findUniqueOrThrow({ where: { id: "global" } });
  assert(settings.adminPasswordHash);
  assert.notEqual(settings.adminPasswordHash, "A6@rX2p!");
  assert.equal(await verifyCredential("A6@rX2p!", settings.adminPasswordHash), true);
  assert.equal(await verifyAdminPassword("123456"), false);
  const already = await req("POST", "/api/admin-auth/initialize",
    { setupToken: state.setupToken, password: "A6@rX2p!" });
  assert.equal(already.statusCode, 403);
  const secondTokenStatus = await req("GET", "/api/admin-auth/status");
  assert.equal(secondTokenStatus.json().passwordConfigured, true);
  assert.equal(secondTokenStatus.json().setupToken, undefined);

  const login = await req("POST", "/api/admin-auth/login",
    { username: "admin", password: "A6@rX2p!" });
  assert.equal(login.statusCode, 200, login.body);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { action: "admin.global_password.initialized" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(audit.actorLogin, "admin");
  assert(!JSON.stringify(audit).includes("A6@rX2p!"));
  console.log("First-run Admin: no preset, localhost+origin+nonce only, single setup, hashed password and audit PASS");
} finally {
  await app.close();
  if (original) await db.systemSettings.update({
    where: { id: "global" }, data: { adminPasswordHash: original.adminPasswordHash },
  });
  else await db.systemSettings.deleteMany({ where: { id: "global" } });
  await db.auditEvent.deleteMany({ where: { action: "admin.global_password.initialized" } });
  if (savedCors === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = savedCors;
  await db.$disconnect();
}
