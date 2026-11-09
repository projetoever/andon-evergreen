import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { hashCredential, verifyCredential } from "../dist/security/technicianCredentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerTechnicianRoutes } from "../dist/routes/technicians.js";
import { updateCentralTechnician } from "../dist/access/centralTechnicianCatalogUpdate.js";

const parsed = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || parsed.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED === "1")
  throw Error("R12-04A restricted to isolated PostgreSQL /andon_test with flags OFF initially");

const db = new PrismaClient();
const contender = new PrismaClient();
const id = randomUUID().replaceAll("-", "").slice(0, 12);
const techIds = [0, 1].map(i => "ci-04a-tech-" + i + "-" + id);
const oldNames = [0, 1].map(i => "CI edit maintainer " + i + " " + id);
const employeeIds = [0, 1].map(i => "CI-04A-EMP-" + i + "-" + id);
const areaIds = [0, 1].map(i => "ci-04a-area-" + i + "-" + id);
const shiftId = "ci-04a-shift-" + id;
const machineId = "ci-04a-machine-" + id;
const stationIds = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [];
const sessions = [];
const pin = "135" + String(randomBytes(4).readUInt32BE(0)).padStart(10, "0").slice(0, 5);
const pinNext = "246" + String(randomBytes(4).readUInt32BE(0)).padStart(10, "0").slice(0, 5);
const tag = "CI-TAG-" + id;
const tagNext = "CI-UPDATED-" + id;
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  update: process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED,
  create: process.env.ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, callId, activeSessionId;
const auditFor = technicianId => db.auditEvent.findMany({
  where: { action: "andon.technician.catalog.update", resourceId: technicianId },
});
function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

try {
  await db.andonCategory.createMany({ data: areaIds.map((area, i) => ({
    id: area, displayName: "CI technician area " + i, categoryGroup: "maintenance",
    active: true, color: "#64748b",
  })) });
  await db.shift.create({ data: {
    id: shiftId, name: "CI technician shift " + id,
    startTime: "06:00", endTime: "14:00", active: true,
  } });
  await db.machine.create({ data: { id: machineId, name: "CI technician safe update" } });
  await db.technician.createMany({ data: techIds.map((tid, i) => ({
    id: tid, name: oldNames[i], employeeId: employeeIds[i],
    technicalArea: areaIds[0], shiftId, active: true,
  })) });
  for (let i = 0; i < 2; i++) {
    await db.technician.update({
      where: { id: techIds[i] },
      data: { pinHash: await hashCredential(pin + i),
        technicalAreas: { create: [{ technicalArea: areaIds[0] }] } },
    });
  }

  await db.workstation.createMany({ data: stationIds.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04a.user." + i + "." + id,
      displayName: "CI 04a delegate " + i,
      roleLabel: i === 0 ? "Produção" : i === 1 ? "Manutenção" : "Gerente",
      accountType: "person", active: true, isPrimaryAdmin: false,
      machineScope: "selected", passwordHash: "test-no-password",
      mustChangePassword: false,
      permissions: { create: i < 2
        ? [{ key: "andon.read" }, { key: "andon.settings.open" }]
        : [{ key: "andon.read" }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    const sess = await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id, workstationId: stationIds[i],
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    } });
    sessions.push(sess.id);
  }

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerTechnicianRoutes(app);
  const send = (i, tid, payload, headers = {}) => app.inject({
    method: "PATCH", url: "/api/technicians/" + tid,
    headers: {
      origin: "https://andon.test", "x-andon-workstation-id": stationIds[i],
      cookie: "__Host-andon-access=" + tokens[i],
      "x-andon-csrf": csrfToken(tokens[i]), ...headers,
    }, payload,
  });
  const denied = await send(0, techIds[0], { name: oldNames[0] + " OFF" });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(denied.json().error, "central_action_not_supported");
  assert.equal((await auditFor(techIds[0])).length, 0);
  process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "1";

  assert.equal((await send(0, techIds[0], { active: false }, { cookie: "" })).statusCode, 401);
  assert.equal((await send(0, techIds[0], { active: false },
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(0, techIds[0], { active: false },
    { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await send(2, techIds[0], { active: false })).statusCode, 403,
    "role label Manager cannot substitute andon.settings.open");
  for (const invalid of [
    { id: "forged" }, { pinHash: "untrusted" }, { currentCallId: "x" },
    { name: oldNames[1] }, { employeeId: employeeIds[1] },
    { technicalAreas: ["invalid"] }, { shiftId: "invalid" },
    { active: "false" }, { pin: "1" }, {},
  ]) {
    const response = await send(0, techIds[0], invalid);
    assert([400, 409].includes(response.statusCode), response.body);
  }
  assert.equal((await auditFor(techIds[0])).length, 0);
  assert.equal((await db.technician.findUniqueOrThrow({ where: { id: techIds[0] } })).name, oldNames[0]);

  // Selected machine scope must still manage the GLOBAL technician catalog:
  // no role label, machine assignment or legacy admin password grants access.
  const changed = await send(0, techIds[0], {
    name: oldNames[0] + " changed",
    employeeId: employeeIds[0] + "-X",
    technicalAreas: [areaIds[0], areaIds[1]],
    shiftId, active: true, pin: pinNext, tag: tagNext,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().name, oldNames[0] + " changed");
  assert.deepEqual(changed.json().technicalAreas.sort(), [...areaIds].sort());
  assert.equal(changed.json().hasTag, true);
  assert(!("pin" in changed.json()) && !("pinHash" in changed.json()) &&
    !("tagHash" in changed.json()) && !("tag" in changed.json()));
  const stored = await db.technician.findUniqueOrThrow({ where: { id: techIds[0] } });
  assert(await verifyCredential(pinNext, stored.pinHash));
  // Stored RFID hashes are based on normalized upper-case tag strings.
  assert(await verifyCredential(tagNext.toUpperCase(), stored.tagHash));
  assert(!(await verifyCredential(pin + "0", stored.pinHash)));
  assert.equal((await auditFor(techIds[0])).length, 1);
  const audit = (await auditFor(techIds[0]))[0];
  assert.equal(audit.actorUserId, userIds[0]);
  assert.equal(audit.workstationId, stationIds[0]);
  assert.equal(audit.after.hasTag, true);
  assert.equal(audit.after.pinRotated, true);
  assert(!JSON.stringify(audit).includes(pinNext));
  assert(!JSON.stringify(audit).includes(tagNext));
  assert(!JSON.stringify(audit).includes(tokens[0]));

  // Fail-closed if any historical or current active session uses this person.
  const call = await db.andonCall.create({ data: {
    machineId, status: "in_progress", category: "maintenance",
    subtype: areaIds[0], criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;
  const ongoing = await db.technicianSession.create({ data: {
    callId, machineId, technicianId: techIds[0],
    technicianName: oldNames[0] + " changed", startedAt: new Date(),
  } });
  activeSessionId = ongoing.id;
  const blocked = await send(0, techIds[0], { name: "Must not rename during session" });
  assert.equal(blocked.statusCode, 409, blocked.body);
  assert.equal(blocked.json().error, "technician_has_active_session");
  await db.technicianSession.delete({ where: { id: activeSessionId } });
  activeSessionId = undefined;

  // Force durable audit failure after the proposed technician update: the
  // PostgreSQL audit IP column is varchar(45). All fields must roll back.
  const prior = (await db.technician.findUniqueOrThrow({ where: { id: techIds[0] } })).name;
  await assert.rejects(updateCentralTechnician(db, {
    token: tokens[0], workstationId: stationIds[0], technicianId: techIds[0],
    body: { name: "This must roll back " + id },
    ipAddress: "x".repeat(46),
  }));
  assert.equal((await db.technician.findUniqueOrThrow({ where: { id: techIds[0] } })).name, prior);
  assert.equal((await auditFor(techIds[0])).length, 1);

  // Separate clients, humans and workstations race to claim the same name;
  // the catalog lock and in-transaction duplicate validation allow one winner.
  const contested = "CI edited collision " + id;
  const race = await Promise.allSettled([
    updateCentralTechnician(db, {
      token: tokens[0], workstationId: stationIds[0], technicianId: techIds[0],
      body: { name: contested },
    }),
    updateCentralTechnician(contender, {
      token: tokens[1], workstationId: stationIds[1], technicianId: techIds[1],
      body: { name: contested },
    }),
  ]);
  assert.equal(race.filter(v => v.status === "fulfilled").length, 1);
  assert.equal(race.filter(v => v.status === "rejected").length, 1);
  assert.equal(race.find(v => v.status === "rejected").reason.code, "technician_name_in_use");
  assert.equal(await db.technician.count({ where: { name: contested } }), 1);

  // Revocation must affect the next mutation, not just UI.
  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  const revoked = await send(0, techIds[0], { active: false });
  assert.equal(revoked.statusCode, 403, revoked.body);
  process.env.ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED = "0";
  const disabledAgain = await send(1, techIds[1], { active: false });
  assert.equal(disabledAgain.statusCode, 403, disabledAgain.body);
  assert.equal(disabledAgain.json().error, "central_action_not_supported");

  console.log("R12-04A technician UPDATE PG PASS: any-role delegate, global selected scope, strict body, PIN/RFID hashing, active-call block, 2-workstation uniqueness race, audit rollback and revocation");
} finally {
  if (app) await app.close();
  for (const [key, value] of Object.entries({
    ANDON_CENTRAL_ACCESS_ENABLED: old.central,
    ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED: old.update,
    ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED: old.create,
    ANDON_ACCESS_ORIGIN: old.origin,
  })) restore(key, value);
  if (activeSessionId) await db.technicianSession.deleteMany({ where: { id: activeSessionId } });
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  await db.technician.deleteMany({ where: { id: { in: techIds } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const id of userIds) {
    await db.accessSession.deleteMany({ where: { userId: id } });
    await db.accessPermission.deleteMany({ where: { userId: id } });
    await db.accessMachine.deleteMany({ where: { userId: id } });
    await db.accessUser.deleteMany({ where: { id } });
  }
  await db.workstation.deleteMany({ where: { id: { in: stationIds } } });
  await db.shift.deleteMany({ where: { id: shiftId } });
  await db.andonCategory.deleteMany({ where: { id: { in: areaIds } } });
  await contender.$disconnect();
  await db.$disconnect();
}
