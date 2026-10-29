import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerFailureClassificationRoutes } from "../dist/routes/failureClassifications.js";
import { tokenHash } from "../dist/access/credentials.js";
import { runCentralFailureClassificationWrite } from "../dist/access/centralFailureClassificationWrite.js";

// Isolated PostgreSQL exercise. Never use the factory/production database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("SEC-04 classification e2e requires isolated /andon_test, opt-in and central HTTP writes OFF");

const db = new PrismaClient();
const second = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const stationId = "ws_" + randomUUID();
const token = randomBytes(32).toString("hex");
const userLogin = "ci.classification." + suffix;
const value = "sec04_pg_" + suffix;
let userId;
let sessionId;
let classificationId;

const submit = (operation, body, overrides = {}, client = db) =>
  runCentralFailureClassificationWrite(client, {
    token, workstationId: stationId, operation,
    classificationId: operation === "update" ? classificationId : undefined,
    body, requestId: "ci-classification-" + suffix,
    ipAddress: "127.0.0.1",
    ...overrides,
  });

const audited = () => classificationId
  ? db.auditEvent.findMany({
      where: { resourceType: "failure_classification", resourceId: classificationId },
      orderBy: { id: "asc" },
    })
  : Promise.resolve([]);

const denies = (code) => (error) => error?.code === code;

try {
  await db.workstation.create({
    data: { id: stationId, active: true, pendingApproval: false, allowOperational: true },
  });
  const user = await db.accessUser.create({
    data: {
      login: userLogin, displayName: "SEC04 catalog acceptance", roleLabel: "Manager",
      accountType: "person", isPrimaryAdmin: false,
      machineScope: "all", passwordHash: "CI disabled password (no login)",
      mustChangePassword: false,
      permissions: { create: [
        { key: "andon.read" }, { key: "catalog.classifications.manage" },
      ] },
    },
  });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({
    data: {
      tokenHash: tokenHash(token), userId, workstationId: stationId,
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
    },
  });
  sessionId = session.id;

  await assert.rejects(submit("create", { label: "CI real", value },
    { token: "0".repeat(64) }), denies("authentication_required"));
  await db.accessPermission.delete({
    where: { userId_key: { userId, key: "catalog.classifications.manage" } },
  });
  await assert.rejects(submit("create", { label: "CI real", value }),
    denies("permission_denied"));
  await db.accessPermission.create({
    data: { userId, key: "catalog.classifications.manage" },
  });
  await db.accessUser.update({ where: { id: userId }, data: { machineScope: "selected" } });
  await assert.rejects(submit("create", { label: "CI real", value }),
    denies("scoped_query_required"));
  await db.accessUser.update({ where: { id: userId }, data: { machineScope: "all" } });
  await db.workstation.update({ where: { id: stationId }, data: { active: false } });
  await assert.rejects(submit("create", { label: "CI real", value }));
  await db.workstation.update({ where: { id: stationId }, data: { active: true } });

  // Database VARCHAR(45) rejects the IP in audit AFTER the domain insert.
  // A rejected audit must roll back the classification, too.
  await assert.rejects(submit("create", { label: "Must roll back", value },
    { ipAddress: "x".repeat(46) }));
  assert.equal(await db.failureClassification.count({ where: { value } }), 0);

  // A single successful mutation and a single same-transaction success audit.
  const created = await submit("create", { label: "CI real", value });
  classificationId = created.id;
  assert.equal(created.value, value);
  let audits = await audited();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorUserId, userId);
  assert.equal(audits[0].workstationId, stationId);
  assert.equal(audits[0].sessionId, sessionId);
  assert.equal(audits[0].action, "catalog.classifications.manage");
  assert.equal(audits[0].after.value, value);
  assert(!JSON.stringify(audits).includes(token), "audit cannot contain access token");

  // Two independent PostgreSQL connections serialize through the global lock.
  const results = await Promise.all([
    submit("update", { label: "First edit" }),
    submit("update", { label: "Second edit" }, {}, second),
  ]);
  assert(results.every((r) => r.id === classificationId));
  const final = await db.failureClassification.findUniqueOrThrow({
    where: { id: classificationId },
  });
  assert(["First edit", "Second edit"].includes(final.label));
  audits = await audited();
  assert.equal(audits.length, 3, "create + both edits must each have exactly one audit");
  const updates = audits.filter((event) => event.before !== null);
  assert.equal(updates.length, 2);
  assert.deepEqual(new Set(updates.map((event) => event.after.label)),
    new Set(["First edit", "Second edit"]));

  // An audit failure must not commit an update even after the domain mutation.
  const prior = final.label;
  await assert.rejects(submit("update", { label: "Not committed" },
    { ipAddress: "x".repeat(46) }));
  assert.equal((await db.failureClassification.findUniqueOrThrow({
    where: { id: classificationId },
  })).label, prior);
  assert.equal((await audited()).length, 3);

  // Reserved BI disposition must never be overridden via the client payload.
  await assert.rejects(submit("update", { value: "different" }),
    denies("immutable_classification_identifier"));
  assert.equal((await audited()).length, 3);


  // SEC-04/2C: exercise the actual registered HTTP path with the same real
  // isolated PostgreSQL credentials, not just the transaction adapter.
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const app = Fastify();
  app.addHook("onRequest", async (request) => {
    Object.defineProperty(request.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerFailureClassificationRoutes(app);
  app.post("/api/andon-calls", async () => ({ incorrectlyAllowed: true }));
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const urlPath = "/api/failure-classifications/" + classificationId;
  const send = (method, path, payload, extra = {}) =>
    app.inject({ method, url: path, headers: { ...headers, ...extra }, payload });
  try {
    const httpEdit = await send("PATCH", urlPath, { label: "HTTP central edit" });
    assert.equal(httpEdit.statusCode, 200, httpEdit.body);
    assert.equal(httpEdit.json().label, "HTTP central edit");
    assert.equal((await audited()).length, 4);

    const httpCreate = await send("POST", "/api/failure-classifications", {
      label: "HTTP reserved exclusion", value: "test",
    });
    // This reserved key may exist from other isolated fixtures; whichever
    // constraint applies, it must NEVER create an included BI classification.
    assert([201, 409].includes(httpCreate.statusCode), httpCreate.body);
    if (httpCreate.statusCode === 201) {
      const createdId = httpCreate.json().id;
      const reserved = await db.failureClassification.findUniqueOrThrow({
        where: { id: createdId },
      });
      assert.equal(reserved.analyticsDisposition, "test");
      await db.failureClassification.delete({ where: { id: createdId } });
    }

    const csrfDenied = await send("PATCH", urlPath, { label: "CSRF bypass" },
      { "x-andon-csrf": "0".repeat(64) });
    assert.equal(csrfDenied.statusCode, 403);
    const guest = await send("PATCH", urlPath, { label: "Guest bypass" },
      { cookie: "" });
    assert.equal(guest.statusCode, 401);

    const otherWrite = await send("POST", "/api/andon-calls", { machineId: "37" });
    assert.equal(otherWrite.statusCode, 403,
      "non-classification central HTTP writes must stay denied");

    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "0";
    const disabled = await send("PATCH", urlPath, { label: "Gate bypass" });
    assert.equal(disabled.statusCode, 403);
    assert.equal(disabled.json().error, "central_action_not_supported");
    assert.equal((await db.failureClassification.findUniqueOrThrow({
      where: { id: classificationId },
    })).label, "HTTP central edit");
    assert.equal((await audited()).length, 4);
  } finally {
    await app.close();
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    delete process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED;
    delete process.env.ANDON_ACCESS_ORIGIN;
  }

  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  await assert.rejects(submit("update", { label: "Revoked" }),
    denies("authentication_required"));
  assert.equal((await audited()).length, 4);
  console.log("SEC-04 catalog PostgreSQL PASS: domain/HTTP, ACL, full scope, CSRF, 2 clients, atomic audit, rollback, revocation and fail-closed gate");
} finally {
  if (classificationId) await db.failureClassification.delete({
    where: { id: classificationId },
  });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
    // Preserve the test's identity for immutable audit provenance.
  }
  await db.workstation.deleteMany({ where: { id: stationId } });
  await second.$disconnect();
  await db.$disconnect();
}
