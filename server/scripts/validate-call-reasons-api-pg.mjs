import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, tokenHash } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerCallReasonRoutes } from "../dist/routes/callReasons.js";
import { runCentralCallReasonWrite } from "../dist/access/centralCallReasonsWrite.js";

const endpoint = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    process.env.NODE_ENV !== "test" ||
    !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
    endpoint.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1") {
  throw Error("R6 reasons API e2e only accepts isolated local /andon_test with explicit opt-in");
}
const db = new PrismaClient();
const second = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const stationId = "ws_" + randomUUID();
const token = randomBytes(32).toString("hex");
const login = "ci.r6.reasons." + suffix;
const reasonId = "r6_reason_" + suffix;
const optionId = "r6_opt_" + suffix;
const areaId = "r6_area_" + suffix;
let userId = null;
let app = null;

function denied(code) { return (error) => error?.code === code; }
const call = (operation, body, client = db, overrides = {}) =>
  runCentralCallReasonWrite(client, {
    token, workstationId: stationId, operation, reasonId: operation === "reason.create" ? undefined : reasonId,
    optionId: operation === "option.update" ? optionId : undefined,
    body, requestId: "ci-r6-" + suffix, ipAddress: "127.0.0.1",
    ...overrides,
  });
const audit = () => db.auditEvent.findMany({
  where: { OR: [
    { resourceType: "call_reason", resourceId: reasonId },
    { resourceType: "call_reason_option", resourceId: optionId },
  ] },
});

try {
  await db.workstation.create({
    data: { id: stationId, active: true, pendingApproval: false, allowOperational: true },
  });
  const user = await db.accessUser.create({
    data: {
      login, displayName: "R6 isolated Admin", roleLabel: "Admin",
      accountType: "person", isPrimaryAdmin: true, machineScope: "all",
      passwordHash: "CI-disabled-no-real-login", mustChangePassword: false,
      permissions: { create: [
        { key: "andon.read" }, { key: "catalog.reasons.manage" },
        { key: "analytics.policy.manage" },
      ] },
    },
  });
  userId = user.id;
  const now = new Date();
  await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: stationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now, expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  await db.andonCategory.create({
    data: { id: areaId, displayName: "Mecânica sintética R6", categoryGroup: "maintenance", color: "#64748B" },
  });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async (request) => {
    Object.defineProperty(request.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  registerCallReasonRoutes(app);
  app.post("/api/andon-calls", async () => ({ incorrectlyAllowed: true }));
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const send = (method, url, payload, extras = {}) =>
    app.inject({ method, url, headers: { ...headers, ...extras },
      ...(payload === undefined ? {} : { payload }) });
  const create = {
    id: reasonId, displayName: "Setup R6 isolado",
    nature: "planned_setup", maintenanceKpiPolicy: "excluded",
    suggestedResponsibility: "operations", analyticsDisposition: "include",
  };
  const newReason = await send("POST", "/api/call-reasons", create);
  assert.equal(newReason.statusCode, 201, newReason.body);
  assert.equal(newReason.json().revision, 1);
  assert.equal((await audit()).length, 1);

  const option = await send("POST", "/api/call-reasons/" + reasonId + "/options", {
    id: optionId, technicalAreaId: areaId,
  });
  assert.equal(option.statusCode, 201, option.body);
  assert.equal((await audit()).length, 2);
  const listed = await send("GET", "/api/call-reasons");
  assert.equal(listed.statusCode, 200, listed.body);
  const current = listed.json().find(row => row.id === reasonId);
  assert.equal(current?.options?.length, 1);
  assert.equal(current.options[0].effectivePolicy.correctiveCandidate, false);
  assert.equal(current.options[0].effectivePolicy.technicalTimeRecordedSeparately, true);
  assert.equal(current.options[0].technicalArea.id, areaId);

  const stale = await send("PATCH", "/api/call-reasons/" + reasonId, {
    expectedRevision: 2, displayName: "Stale edit",
  });
  assert.equal(stale.statusCode, 409, stale.body);
  const invalid = await send("PATCH", "/api/call-reasons/" + reasonId, {
    expectedRevision: 1, maintenanceKpiPolicy: "eligible",
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  assert.equal((await audit()).length, 2);

  // Two concurrent editors use two PostgreSQL clients and the SAME revision.
  const edits = await Promise.allSettled([
    call("reason.update", { expectedRevision: 1, displayName: "Setup A" }, db),
    call("reason.update", { expectedRevision: 1, displayName: "Setup B" }, second),
  ]);
  assert.equal(edits.filter(x => x.status === "fulfilled").length, 1);
  const rejects = edits.filter(x => x.status === "rejected");
  assert.equal(rejects.length, 1);
  assert.equal(rejects[0].reason.code, "call_reason_revision_conflict");
  assert.equal((await audit()).length, 3);

  // An audit insertion error MUST roll back the catalog mutation.
  const before = await db.callReason.findUniqueOrThrow({ where: { id: reasonId } });
  await assert.rejects(
    call("reason.update", { expectedRevision: before.revision, displayName: "Uncommitted" }, db,
      { ipAddress: "x".repeat(46) }),
  );
  const after = await db.callReason.findUniqueOrThrow({ where: { id: reasonId } });
  assert.equal(after.displayName, before.displayName);
  assert.equal(after.revision, before.revision);
  assert.equal((await audit()).length, 3);

  const optionPatch = await send("PATCH",
    "/api/call-reasons/" + reasonId + "/options/" + optionId,
    { expectedRevision: 1, displayName: "Mecânica de Setup" });
  assert.equal(optionPatch.statusCode, 200, optionPatch.body);
  assert.equal(optionPatch.json().revision, 2);
  assert.equal((await audit()).length, 4);

  // Denied at HTTP gate before SQL; no audit of unsuccessful mutations.
  for (const [changes, payload, expected] of [
    [{ "x-andon-csrf": "0".repeat(64) }, create, 403],
    [{ origin: "https://evil.test" }, create, 403],
    [{ cookie: "__Host-andon-access=" + "0".repeat(64) }, create, 403],
    [{ "x-andon-workstation-id": "ws_" + randomUUID() }, create, 403],
  ]) {
    const res = await send("POST", "/api/call-reasons", payload, changes);
    assert.equal(res.statusCode, expected, res.body);
  }
  assert.equal((await audit()).length, 4);

  await db.accessUser.update({ where: { id: userId }, data: { isPrimaryAdmin: false } });
  const nonAdmin = await send("GET", "/api/call-reasons");
  assert.equal(nonAdmin.statusCode, 403, nonAdmin.body);
  await db.accessUser.update({ where: { id: userId }, data: { isPrimaryAdmin: true } });
  await db.accessPermission.delete({ where: {
    userId_key: { userId, key: "analytics.policy.manage" },
  } });
  const unprivileged = await send("PATCH", "/api/call-reasons/" + reasonId,
    { expectedRevision: after.revision, displayName: "Denied" });
  assert.equal(unprivileged.statusCode, 403, unprivileged.body);
  await db.accessPermission.create({ data: { userId, key: "analytics.policy.manage" } });

  process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "0";
  assert.equal((await send("GET", "/api/call-reasons")).statusCode, 403);
  assert.equal((await send("POST", "/api/call-reasons", create)).statusCode, 403);
  process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  assert.equal((await send("GET", "/api/call-reasons")).statusCode, 403);
  assert.equal((await send("POST", "/api/call-reasons", create)).statusCode, 403);
  assert.equal((await audit()).length, 4);
  assert(!(JSON.stringify(await audit())).includes(token), "audit must never contain auth token");

  process.stdout.write("R6 reasons HTTP PostgreSQL PASS: ACL, CSRF, revision race, KPI, audit atomicity and flag rollback\n");
} finally {
  if (app) await app.close();
  await db.callReasonOption.deleteMany({ where: { reasonId } });
  await db.callReason.deleteMany({ where: { id: reasonId } });
  await db.auditEvent.deleteMany({ where: { OR: [
    { resourceType: "call_reason", resourceId: reasonId },
    { resourceType: "call_reason_option", resourceId: optionId },
  ] } });
  await db.andonCategory.deleteMany({ where: { id: areaId } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: stationId } });
  await Promise.all([db.$disconnect(), second.$disconnect()]);
  delete process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
  delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  delete process.env.ANDON_ACCESS_ORIGIN;
}
