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
const writerToken = randomBytes(32).toString("hex");
const verifierPassword = "VerifyProduction-" + nonce;
const users = [];
let app;
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
    lockedMachineId: machineId,
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
  await db.accessSession.create({ data: {
    tokenHash: tokenHash(writerToken), workstationId: ws, userId: verifier.id,
    purpose: "normal", authorizationVersion: verifier.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
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
  const directPost = (changes = {}, overrides = {}, currentToken = writerToken) => app.inject({
    method: "POST", url: "/api/access/machines/production-mode/session",
    headers: {
      ...headers,
      cookie: "__Host-andon-access=" + currentToken,
      "x-andon-csrf": csrfToken(currentToken),
      ...overrides,
    },
    payload: {
      machineId, expectedProductionMode: "not_scheduled", productionMode: "scheduled",
      ...changes,
    },
  });
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  assert.equal((await post()).statusCode, 403, "Central schedule changes must be disabled in legacy mode");
  assert.equal((await directPost()).statusCode, 403, "Session write cannot bypass central disabled");
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  assert.equal((await post({ password: "incorrect" })).statusCode, 401);
  assert.equal((await directPost({}, {}, token)).statusCode, 403,
    "production.schedule.request alone must NOT authorize a direct write");
  assert.equal((await directPost({}, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await directPost({}, { origin: "https://evil.test" })).statusCode, 403);
  assert.equal((await directPost({ unexpected: "x" })).statusCode, 400);
  assert.equal((await directPost({ expectedProductionMode: "scheduled", productionMode: "scheduled" })).statusCode, 400);
  assert.equal((await directPost({ machineId: otherMachineId })).statusCode, 403,
    "Writer cannot mutate a different machine from locked workstation");
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
  assert.equal(audits[0].actorUserId, operator.id);
  assert.doesNotMatch(JSON.stringify(audits[0]), new RegExp(verifierPassword));
  // Session is still the original pinned Production account.
  const live = await db.accessSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(live.userId, operator.id);
  assert.equal(live.revokedAt, null);
  assert.equal(live.persistentOperational, true);
  assert.equal((await post()).statusCode, 409, "stale second operator must not overwrite a committed change");

  const viaSession = await directPost();
  assert.equal(viaSession.statusCode, 200, viaSession.body);
  assert.equal(viaSession.json().productionMode, "scheduled");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).productionMode, "scheduled");
  const updatedEvents = await db.machineProductionEvent.findMany({
    where: { machineId }, orderBy: { startedAt: "asc" },
  });
  assert.equal(updatedEvents.length, 3, "Direct write preserves previous events and opens one new event");
  assert.ok(updatedEvents[1].endedAt);
  assert.equal(updatedEvents[2].endedAt, null);
  assert.equal(updatedEvents[2].productionMode, "scheduled");
  const directAudits = await db.auditEvent.findMany({
    where: { action: "machine.production_mode.session_authorized", resourceId: machineId },
  });
  assert.equal(directAudits.length, 1);
  assert.equal(directAudits[0].actorUserId, verifier.id, "Write is attributed to logged-in writer");
  assert.equal((await directPost()).statusCode, 409, "stale direct write must not overwrite a committed change");

  await db.accessUser.update({ where: { id: verifier.id },
    data: { permissions: { deleteMany: { key: "production.schedule.write" } } } });
  assert.equal((await post({ expectedProductionMode: "not_scheduled", productionMode: "scheduled" })).statusCode, 401,
    "Revoked verifier approval must not write");
  assert.equal((await directPost({
    expectedProductionMode: "scheduled", productionMode: "not_scheduled",
  })).statusCode, 403, "Revoked production.schedule.write must deny direct writer");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).productionMode, "scheduled");
  await db.accessUser.update({ where: { id: operator.id },
    data: { permissions: { deleteMany: { key: "production.schedule.request" } } } });
  assert.equal((await post({ expectedProductionMode: "not_scheduled", productionMode: "scheduled" })).statusCode, 403,
    "Terminal without request grant cannot perform this one-shot operation");
  console.log("PENTE2 schedule PG PASS: credential approver and direct authorized session, CSRF, Origin, locked machine, CAS, events, audit, revoked write and request-only denial");
} finally {
  if (app) await app.close();
  if (previousCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousCentral;
  // Audit log is append-only even in CI: do not delete or update audit rows.
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
