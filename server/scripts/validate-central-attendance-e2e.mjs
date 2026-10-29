import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { tokenHash } from "../dist/access/credentials.js";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { runCentralMultiTechnicianAttendancePrototype } from "../dist/access/centralMultiAttendancePrototype.js";

// A real PostgreSQL test, not mocked locks, AND NEVER a production callback.
// Every database and the central write gate must be deliberately isolated.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1") {
  throw Error("SEC-04/2A.9b2b requires ANDON_INTEGRATION_TEST=1, /andon_test and central write gate OFF");
}

const db = new PrismaClient();
const contender = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = `ci-e2e-machine-${n}`;
const stationId = `ws_${randomUUID()}`;
const otherStationId = `ws_${randomUUID()}`;
const userLogin = `e2e.${n}`;
const technicianIds = [`ci-e2e-a-${n}`, `ci-e2e-b-${n}`];
const pins = Array.from({ length: 2 }, () => String(randomInt(10000000, 99999999)));
const credentials = pins.map((value) => ({ method: "pin", value }));
const token = randomBytes(32).toString("hex");
const callIds = [];
let userId;
let sessionId;

function deniedCode(error, code) {
  return error && error.code === code;
}
async function assertUnchanged(callId, expectedAudit = 0) {
  const [call, sessions, audits] = await Promise.all([
    db.andonCall.findUniqueOrThrow({ where: { id: callId } }),
    db.technicianSession.count({ where: { callId } }),
    db.auditEvent.count({ where: { resourceType: "andon_call", resourceId: callId, action: "calls.attend" } }),
  ]);
  assert.equal(call.status, "open", "failed attempt cannot change call status");
  assert.equal(sessions, 0, "failed attempt cannot leave technical sessions");
  assert.equal(audits, expectedAudit, "failed attempt cannot leave an audit of success");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).currentCallId, null);
}

function attempt(callId, group = credentials, overrides = {}, client = db) {
  return runCentralMultiTechnicianAttendancePrototype(client, {
    token,
    workstationId: stationId,
    callId,
    credentials: group,
    requestId: `sec04-e2e-${n}`,
    ipAddress: "127.0.0.1",
    ...overrides,
  });
}

async function createCall() {
  const call = await db.andonCall.create({
    data: {
      machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date(),
    },
  });
  callIds.push(call.id);
  return call.id;
}

try {
  await db.workstation.createMany({
    data: [
      { id: stationId, active: true, pendingApproval: false, allowOperational: true },
      { id: otherStationId, active: true, pendingApproval: false, allowOperational: true },
    ],
  });
  await db.machine.create({
    data: { id: machineId, name: "SEC04 isolated end-to-end", isActive: true },
  });
  for (let index = 0; index < technicianIds.length; index++) {
    await db.technician.create({
      data: {
        id: technicianIds[index],
        employeeId: `e2e-${n}-${index}`,
        name: `E2E Technician ${index} ${n}`,
        active: true,
        technicalArea: "mechanical",
        pinHash: await hashCredential(pins[index]),
      },
    });
  }
  const user = await db.accessUser.create({
    data: {
      login: userLogin, displayName: "E2E central maintenance operator",
      roleLabel: "Maintenance", accountType: "person",
      isPrimaryAdmin: false, machineScope: "selected",
      passwordHash: "CI disabled password (no login)",
      mustChangePassword: false,
      permissions: { create: [{ key: "andon.read" }, { key: "calls.attend" }] },
      machines: { create: [{ machineId }] },
    },
  });
  userId = user.id;
  const now = new Date();
  const session = await db.accessSession.create({
    data: {
      tokenHash: tokenHash(token), userId, workstationId: stationId,
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60_000),
    },
  });
  sessionId = session.id;
  const firstCall = await createCall();

  // A wrong token or cloned station UUID must not reach the domain callback.
  await assert.rejects(attempt(firstCall, credentials, { token: "0".repeat(64) }),
    (e) => deniedCode(e, "authentication_required"));
  await assert.rejects(attempt(firstCall, credentials, { workstationId: otherStationId }),
    (e) => deniedCode(e, "authentication_required"));
  await assertUnchanged(firstCall);

  // Machine scope is verified from server-owned AccessMachine rows, not body.
  await db.accessMachine.delete({ where: { userId_machineId: { userId, machineId } } });
  await assert.rejects(attempt(firstCall), (e) => deniedCode(e, "call_not_found"));
  await assertUnchanged(firstCall);
  await db.accessMachine.create({ data: { userId, machineId } });

  // Missing calls.attend permission denies even if module read is allowed.
  await db.accessPermission.delete({ where: { userId_key: { userId, key: "calls.attend" } } });
  await assert.rejects(attempt(firstCall), (e) => deniedCode(e, "permission_denied"));
  await assertUnchanged(firstCall);
  await db.accessPermission.create({ data: { userId, key: "calls.attend" } });

  // One invalid credential invalidates the whole group and leaves NO audit.
  await assert.rejects(attempt(firstCall, [credentials[0], { method: "pin", value: "00000000" }]),
    (e) => deniedCode(e, "technician_credential_invalid"));
  await assertUnchanged(firstCall);

  // An audit failure AFTER valid PINs + domain updates must roll back all
  // writes. PostgreSQL rejects an oversized varchar(45) audit IP address.
  await assert.rejects(attempt(firstCall, credentials, { ipAddress: "x".repeat(46) }));
  await assertUnchanged(firstCall);

  // Independent Prisma connections race with opposite credential order.
  // User->station->machine->ordered technician locks serialize all writes.
  const results = await Promise.allSettled([
    attempt(firstCall, credentials),
    attempt(firstCall, [credentials[1], credentials[0]], {}, contender),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1,
    "one and only one central attendance may succeed");
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const losing = results.find((result) => result.status === "rejected");
  assert(deniedCode(losing.reason, "call_state_changed"),
    `race loser should get call_state_changed, not ${losing.reason?.code || losing.reason}`);
  const winner = results.find((result) => result.status === "fulfilled").value;
  assert.equal(winner.status, "in_progress");
  assert(winner.attendedAt instanceof Date);
  assert.equal(winner.currentAttendanceCycle, 1);

  const committed = await db.technicianSession.findMany({
    where: { callId: firstCall }, orderBy: { technicianId: "asc" },
  });
  assert.equal(committed.length, 2);
  assert.deepEqual(committed.map((item) => item.technicianId).sort(), [...technicianIds].sort());
  assert(committed.every((item) => item.workstationId === stationId));
  assert(committed.every((item) => item.phase === "maintenance" && item.cycleIndex === 1));
  const machine = await db.machine.findUniqueOrThrow({ where: { id: machineId } });
  assert.equal(machine.currentCallId, firstCall);
  assert.equal(machine.andonStatus, "in_progress");

  const audits = await db.auditEvent.findMany({
    where: { action: "calls.attend", resourceType: "andon_call", resourceId: firstCall },
  });
  assert.equal(audits.length, 1, "race and retries cannot duplicate success audit");
  assert.equal(audits[0].actorType, "user");
  assert.equal(audits[0].actorUserId, userId);
  assert.equal(audits[0].actorLogin, userLogin);
  assert.equal(audits[0].workstationId, stationId);
  assert.equal(audits[0].sessionId, sessionId);
  assert.equal(audits[0].resourceId, firstCall);
  assert.equal(audits[0].machineId, machineId);
  assert.equal(audits[0].result, "success");
  assert.deepEqual([...audits[0].after.technicianIds].sort(), [...technicianIds].sort());
  const serializedAudit = JSON.stringify(audits[0]);
  for (const secret of [...pins, token, tokenHash(token)]) {
    assert(!serializedAudit.includes(secret), "audit must not contain credentials or session tokens");
  }

  // Replays must fail closed: at-most-once attendance, not success replay.
  await assert.rejects(attempt(firstCall), (e) => deniedCode(e, "call_state_changed"));
  assert.equal(await db.technicianSession.count({ where: { callId: firstCall } }), 2);
  assert.equal(await db.auditEvent.count({ where: { action: "calls.attend", resourceId: firstCall } }), 1);

  const secondCall = await createCall();
  await db.accessSession.update({
    where: { id: sessionId }, data: { revokedAt: new Date() },
  });
  await assert.rejects(attempt(secondCall), (e) => deniedCode(e, "authentication_required"));
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: secondCall } })).status, "open");
  assert.equal(await db.technicianSession.count({ where: { callId: secondCall } }), 0);
  assert.equal(await db.auditEvent.count({ where: { action: "calls.attend", resourceId: secondCall } }), 0);

  // The same request is never routed through central HTTP writes.
  console.log("SEC-04/2A.9b2b PostgreSQL PASS: real principal/session, scope, PIN group, 2 connections, atomic audit+rollback, at-most-once replay and revocation");
} finally {
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessUser.update({ where: { id: userId }, data: { active: false } });
    // Keep the synthetic user as an inactive provenance placeholder for the
    // immutable, append-only audit records in the isolated andon_test DB.
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.workstation.deleteMany({ where: { id: { in: [stationId, otherStationId] } } });
  await contender.$disconnect();
  await db.$disconnect();
}
