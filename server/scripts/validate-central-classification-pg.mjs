import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
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

  await db.accessSession.update({ where: { id: sessionId },
    data: { revokedAt: new Date() } });
  await assert.rejects(submit("update", { label: "Revoked" }),
    denies("authentication_required"));
  assert.equal((await audited()).length, 3);
  console.log("SEC-04 catalog PostgreSQL PASS: ACL, full scope, station, rollback, two clients, audit and revocation");
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
