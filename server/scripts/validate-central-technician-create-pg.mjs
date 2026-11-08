import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken, tokenHash } from "../dist/access/credentials.js";
import { verifyCredential } from "../dist/security/technicianCredentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerTechnicianRoutes } from "../dist/routes/technicians.js";

const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Technician create regression restricted to isolated CI /andon_test with central OFF");
const db = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const workstationId = "ws_" + randomUUID();
const login = "ci.r11.tech." + suffix;
const categoryId = "ci-tech-cat-" + suffix;
const shiftId = "ci-tech-shift-" + suffix;
const employeeId = "CI-EMP-" + suffix;
const name = "CI Technician " + suffix;
const rawPin = randomBytes(4).readUInt32BE(0).toString().padStart(10, "0").slice(0, 8);
const rawTag = "CI-TAG-" + suffix;
const token = randomBytes(32).toString("hex");
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  flag: process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId, sessionId, technicianId;
try {
  await db.andonCategory.create({ data: {
    id: categoryId, displayName: "CI electrical", categoryGroup: "maintenance",
    color: "#64748b", active: true,
  } });
  await db.shift.create({ data: {
    id: shiftId, name: "CI shift " + suffix, startTime: "06:00",
    endTime: "14:00", active: true,
  } });
  await db.workstation.create({ data: {
    id: workstationId, active: true, pendingApproval: false,
    allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI REFINE11 technician catalog delegate",
    roleLabel: "Produção", accountType: "person", active: true,
    isPrimaryAdmin: false, machineScope: "selected",
    passwordHash: "CI unused password", mustChangePassword: false,
    permissions: { create: [{ key: "andon.read" }, { key: "andon.settings.open" }] },
  } });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });
  sessionId = session.id;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async request =>
    Object.defineProperty(request.raw.socket, "encrypted",
      { value: true, configurable: true }));
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerTechnicianRoutes(app);
  const headers = {
    origin: "https://andon.test", "x-andon-workstation-id": workstationId,
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrfToken(token),
  };
  const send = (payload, over = {}) => app.inject({
    method: "POST", url: "/api/technicians",
    headers: { ...headers, ...over }, payload,
  });
  const payload = {
    name, employeeId, technicalArea: categoryId,
    technicalAreas: [categoryId], shiftId, active: true,
    pin: rawPin, tag: rawTag,
  };
  const auditCount = () => db.auditEvent.count({
    where: { action: "andon.technician.catalog.create" },
  });
  const auditBefore = await auditCount();

  const disabled = await send(payload);
  assert.equal(disabled.statusCode, 403, disabled.body);
  assert.equal(disabled.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "1";
  assert.equal((await send(payload, { cookie: "" })).statusCode, 401);
  assert.equal((await send(payload, { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(payload, { origin: "https://evil.invalid" })).statusCode, 403);
  for (const body of [
    { ...payload, pinHash: "unsafe" }, { ...payload, password: "unsafe" },
    { ...payload, technicalAreas: ["nonexistent"] },
    { ...payload, shiftId: "nonexistent" },
    { ...payload, pin: "1" },
  ]) {
    const response = await send(body);
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(await auditCount(), auditBefore);

  const created = await send(payload);
  assert.equal(created.statusCode, 201, created.body);
  const publicBody = created.json();
  technicianId = publicBody.id;
  assert.equal(publicBody.name, name);
  assert.equal(publicBody.employeeId, employeeId);
  assert.deepEqual(publicBody.technicalAreas, [categoryId]);
  assert.equal(publicBody.shiftId, shiftId);
  assert.equal(publicBody.hasPin, true);
  assert.equal(publicBody.hasTag, true);
  assert(!("pin" in publicBody) && !("tag" in publicBody) &&
    !("pinHash" in publicBody) && !("tagHash" in publicBody));
  const stored = await db.technician.findUniqueOrThrow({
    where: { id: technicianId }, include: { technicalAreas: true },
  });
  assert.equal(stored.active, true);
  assert.equal(stored.technicalAreas.length, 1);
  assert(await verifyCredential(rawPin, stored.pinHash));
  assert(await verifyCredential(rawTag, stored.tagHash));
  assert.notEqual(stored.pinHash, rawPin);
  assert.notEqual(stored.tagHash, rawTag);
  const event = await db.auditEvent.findFirstOrThrow({
    where: { action: "andon.technician.catalog.create", resourceId: technicianId },
  });
  assert.equal(event.actorUserId, userId);
  assert.equal(event.after.hasPin, true);
  assert(!JSON.stringify(event).includes(rawPin));
  assert(!JSON.stringify(event).includes(rawTag));
  assert.equal(await auditCount(), auditBefore + 1);

  for (const dup of [
    { ...payload, name: name.toUpperCase(), employeeId: employeeId + "-A", pin: "78394128", tag: "" },
    { ...payload, name: name + " extra", employeeId: employeeId.toLowerCase(), pin: "78394128", tag: "" },
    { ...payload, name: name + " second", employeeId: employeeId + "-B", tag: "", pin: rawPin },
  ]) {
    const response = await send(dup);
    assert.equal(response.statusCode, 409, response.body);
  }
  assert.equal(await auditCount(), auditBefore + 1);
  const deniedPhysical = await app.inject({
    method: "PATCH", url: "/api/technicians/" + technicianId,
    headers, payload: { active: false, pin: "1234" },
  });
  assert.equal(deniedPhysical.statusCode, 403);

  await db.accessPermission.deleteMany({ where: { userId, key: "andon.settings.open" } });
  const revoked = await send({ ...payload, name: name + " revoked", employeeId: employeeId + "-C" });
  assert.equal(revoked.statusCode, 403, revoked.body);
  assert.equal(await auditCount(), auditBefore + 1);
  process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED = "0";
  const toggled = await send(payload);
  assert.equal(toggled.statusCode, 403);
  assert.equal(toggled.json().error, "central_action_not_supported");

  console.log("REFINE 11 technician create PASS: human ACL, TLS, CSRF, shift/area, credential hashing and uniqueness, audit, revocation, no PATCH");
} finally {
  if (app) await app.close();
  // Audit is append-only in disposable CI; do not delete or mutate it.
  if (sessionId) await db.accessSession.deleteMany({ where: { id: sessionId } });
  if (userId) {
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  if (technicianId) await db.technician.deleteMany({ where: { id: technicianId } });
  await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.shift.deleteMany({ where: { id: shiftId } });
  await db.andonCategory.deleteMany({ where: { id: categoryId } });
  await db.$disconnect();
  for (const [key, value] of Object.entries({
    ANDON_CENTRAL_ACCESS_ENABLED: old.central,
    ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED: old.flag,
    ANDON_ACCESS_ORIGIN: old.origin,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
