import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, hashAccessPassword, tokenHash } from "../dist/access/credentials.js";
import { registerAccessRoutes } from "../dist/routes/access.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Production mode test needs isolated /andon_test with central access initially OFF");

const previousCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
const db = new PrismaClient();
const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci-prod-mode-" + nonce;
const otherMachineId = "ci-prod-other-" + nonce;
const ws = "ws_" + randomUUID();
const token = randomBytes(32).toString("hex");
const verifierPassword = "VerifyProduction-" + nonce;
const users = [];
let app, callAuditId;
try {
  await db.machine.createMany({ data: [
    { id: machineId, name: "CI schedule", productionMode: "scheduled", isActive: true },
    { id: otherMachineId, name: "CI other", productionMode: "scheduled", isActive: true },
  ] });
  await db.machineProductionEvent.create({ data: {
    machineId, productionMode: "scheduled", startedAt: new Date(Date.now() - 60_000),
  } });
  await db.workstation.create({ data: {
    id: ws, active: true, pendingApproval: false, allowOperational: true,
    allowPersistentOperationalLogin: true, lockedMachineId: machineId,
  } });
  const verifier = await db.accessUser.create({ data: {
    login: "ci.prod.approver." + nonce, displayName: "CI verifier",
    roleLabel: "Gerente", accountType: "person", machineScope: "all",
    passwordHash: await hashAccessPassword(verifierPassword), mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "production.schedule.write" },
    ] },
  } });
  users.push(verifier.id);
  const operator = await db.accessUser.create({ data: {
    login: "ci.prod.terminal." + nonce, displayName: "CI terminal",
    roleLabel: "Produção", accountType: "person", machineScope: "selected",
    sessionPolicy: "persistent", passwordHash: "CI no login", mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "production.schedule.request" },
    ] },
    machines: { create: [{ machineId }] },
  } });
  users.push(operator.id);
  const now = new Date();
  const session = await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), workstationId: ws, userId: operator.id,
    purpose: "normal", authorizationVersion: operator.authorizationVersion,
    createdAt: new Date(now.getTime() - 86_400_000),
    lastInteractionAt: new Date(now.getTime() - 86_400_000),
    expiresAt: new Date(now.getTime() - 60_000),
    persistentOperational: true, persistentMachineId: machineId,
  } });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true });
  });
  registerAccessRoutes(app, db, "https://andon.test");
  await app.ready();
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": ws,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const body = {
    machineId, expectedProductionMode: "scheduled", productionMode: "not_scheduled",
    login: verifier.login, password: verifierPassword,
  };
  const post = (changes = {}, overrides = {}) => app.inject({
    method: "POST", url: "/api/access/machines/production-mode",
    headers: { ...headers, ...overrides }, payload: { ...body, ...changes },
  });
  assert.equal((await post({ password: "incorrect" })).statusCode, 401);
  assert.equal((await post({}, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await post({}, { origin: "https://evil.test" })).statusCode, 403);
  assert.equal((await post({ machineId: otherMachineId })).statusCode, 403);
  assert.equal((await post({ productionMode: "scheduled" })).statusCode, 400);
  assert.equal((await post({ unwanted: "x" })).statusCode, 400);
  assert.equal(await db.machineProductionEvent.count({ where: { machineId, endedAt: null } }), 1);
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).productionMode, "scheduled");
  const changed = await post();
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().productionMode, "not_scheduled");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).productionMode, "not_scheduled");
  const events = await db.machineProductionEvent.findMany({
    where: { machineId }, orderBy: { startedAt: "asc" },
  });
  assert.equal(events.length, 2);
  assert.ok(events[0].endedAt);
  assert.equal(events[1].endedAt, null);
  assert.equal(events[1].productionMode, "not_scheduled");
  const audits = await db.auditEvent.findMany({
    where: { action: "machine.production_mode.credential_verified", resourceId: machineId },
  });
  assert.equal(audits.length, 1);
  callAuditId = audits[0].id;
  assert.equal(audits[0].actorUserId, operator.id);
  assert.doesNotMatch(JSON.stringify(audits[0]), new RegExp(verifierPassword));
  // Session is still the original pinned Production account.
  const live = await db.accessSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(live.userId, operator.id);
  assert.equal(live.revokedAt, null);
  assert.equal(live.persistentOperational, true);
  assert.equal((await post()).statusCode, 409, "stale second operator must not overwrite a committed change");

  await db.accessUser.update({ where: { id: verifier.id },
    data: { permissions: { deleteMany: { key: "production.schedule.write" } } } });
  assert.equal((await post({ expectedProductionMode: "not_scheduled", productionMode: "scheduled" })).statusCode, 401,
    "Revoked verifier approval must not write");
  await db.accessUser.update({ where: { id: operator.id },
    data: { permissions: { deleteMany: { key: "production.schedule.request" } } } });
  assert.equal((await post({ expectedProductionMode: "not_scheduled", productionMode: "scheduled" })).statusCode, 403,
    "Terminal without request grant cannot perform this one-shot operation");
  console.log("REFINE20 schedule step-up PG PASS: central persistent terminal, password, CSRF, Origin, cross-machine, stale revision, audit, no session elevation, revocations");
} finally {
  if (app) await app.close();
  if (previousCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousCentral;
  await db.auditEvent.deleteMany({ where: { action: "machine.production_mode.credential_verified", resourceId: machineId } });
  await db.machineProductionEvent.deleteMany({ where: { machineId } });
  for (const id of users) {
    await db.accessSession.deleteMany({ where: { userId: id } });
    await db.accessPermission.deleteMany({ where: { userId: id } });
    await db.accessMachine.deleteMany({ where: { userId: id } });
    await db.accessUser.update({ where: { id }, data: { active: false } });
  }
  await db.workstation.deleteMany({ where: { id: ws } });
  await db.machine.deleteMany({ where: { id: { in: [machineId, otherMachineId] } } });
  await db.$disconnect();
}
