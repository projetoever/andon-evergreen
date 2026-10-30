import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { tokenHash } from "../dist/access/credentials.js";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { runCentralMultiTechnicianAttendancePrototype } from "../dist/access/centralMultiAttendancePrototype.js";
import { runCentralMaintenanceCompletion } from "../dist/access/centralMaintenanceCompletion.js";
import { runCentralReturnToMaintenance } from "../dist/access/centralReturnToMaintenance.js";

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
  // SEC-04/2D: exercise the real HTTP attendance handler with a selected
  // machine-scope human and two PINs, then restore the synthetic machine so
  // the existing direct-adapter race tests remain independent.
  const httpCallId = await createCall();
  const previousCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const previousFlag = process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED;
  const previousOrigin = process.env.ANDON_ACCESS_ORIGIN;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const httpApp = Fastify();
  httpApp.addHook("onRequest", async (req) => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  httpApp.addHook("preHandler", enforceWorkstationAccess);
  httpApp.addHook("preHandler", enforceAdminAuthorization);
  httpApp.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCallRoutes(httpApp);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": stationId,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const path = "/api/andon-calls/" + httpCallId + "/attend";
  const send = (extraHeaders = {}, body = { credentials }) =>
    httpApp.inject({ method: "PATCH", url: path,
      headers: { ...headers, ...extraHeaders }, payload: body });
  try {
    const badCsrf = await send({ "x-andon-csrf": "0".repeat(64) });
    assert.equal(badCsrf.statusCode, 403);
    const guest = await send({ cookie: "" });
    assert.equal(guest.statusCode, 401);
    const invalid = await send({}, { credentials: [{ method: "pin", value: "00000000" }] });
    assert.equal(invalid.statusCode, 403);
    assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: httpCallId } })).status, "open");
    assert.equal(await db.auditEvent.count({
      where: { resourceType: "andon_call", resourceId: httpCallId, action: "calls.attend" },
    }), 0);

    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "0";
    const off = await send();
    assert.equal(off.statusCode, 403);
    assert.equal(off.json().error, "central_action_not_supported");
    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "1";

    const done = await send();
    assert.equal(done.statusCode, 200, done.body);
    assert.equal(done.json().status, "in_progress");
    assert.equal(await db.technicianSession.count({ where: { callId: httpCallId } }), 2);
    assert.equal(await db.auditEvent.count({
      where: { resourceType: "andon_call", resourceId: httpCallId, action: "calls.attend" },
    }), 1);
    const replay = await send();
    assert.equal(replay.statusCode, 409);
    assert.equal(replay.json().error, "call_state_changed");

    // SEC-04/2F: complete the SAME HTTP-attended call using the shared
    // legacy domain, with permission, scope, workstation and atomic audit.
    const beforeSettings = await db.systemSettings.findUnique({ where: { id: "global" } });
    await db.systemSettings.upsert({
      where: { id: "global" },
      create: { id: "global", restrictMaintenanceCompletionToAttendanceWorkstation: true },
      update: { restrictMaintenanceCompletionToAttendanceWorkstation: true },
    });
    const completionFlag = process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED;
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "1";
    const completionPath = "/api/andon-calls/" + httpCallId + "/finish-maintenance";
    const finish = (body = { notes: "Tested completion" }, extraHeaders = {}) =>
      httpApp.inject({ method: "PATCH", url: completionPath,
        headers: { ...headers, ...extraHeaders }, payload: body });
    const completedAudit = () => db.auditEvent.count({
      where: { resourceType: "andon_call", resourceId: httpCallId,
        action: "calls.finishMaintenance" },
    });
    try {
      // Missing permission, malformed body and CSRF must not change live state.
      const noPermission = await finish();
      assert.equal(noPermission.statusCode, 403);
      await db.accessPermission.create({
        data: { userId, key: "calls.finishMaintenance" },
      });
      const invalidCsrf = await finish(undefined, { "x-andon-csrf": "0".repeat(64) });
      assert.equal(invalidCsrf.statusCode, 403);
      const withoutCookie = await finish(undefined, { cookie: "" });
      assert.equal(withoutCookie.statusCode, 401);
      const badPayload = await finish({ notes: "Valid", unknownPrivilege: true });
      assert.equal(badPayload.statusCode, 400);
      await db.accessMachine.delete({
        where: { userId_machineId: { userId, machineId } },
      });
      const deniedScope = await finish();
      assert.equal(deniedScope.statusCode, 404);
      await db.accessMachine.create({ data: { userId, machineId } });

      // A different *valid* central workstation+session is NOT allowed to
      // conclude maintenance whose technician sessions started elsewhere.
      const alternateToken = randomBytes(32).toString("hex");
      await db.accessSession.create({
        data: {
          tokenHash: tokenHash(alternateToken), userId, workstationId: otherStationId,
          purpose: "normal", authorizationVersion: user.authorizationVersion,
          createdAt: now, lastInteractionAt: now,
          expiresAt: new Date(now.getTime() + 3600000),
        },
      });
      const foreign = await finish(undefined, {
        "x-andon-workstation-id": otherStationId,
        cookie: "__Host-andon-access=" + alternateToken,
        "x-andon-csrf": csrfToken(alternateToken),
      });
      assert.equal(foreign.statusCode, 400, foreign.body);
      assert.match(foreign.json().message ?? "", /workstation/i);

      // Audit insertion failure MUST rollback domain transition and every
      // technician session/follow-up mutation, not just the HTTP response.
      await assert.rejects(runCentralMaintenanceCompletion(db, {
        token, workstationId: stationId, callId: httpCallId,
        followUpSessionIds: [],
        ipAddress: "x".repeat(46),
      }));
      assert.equal((await db.andonCall.findUniqueOrThrow({
        where: { id: httpCallId },
      })).status, "in_progress");
      assert.equal((await db.technicianSession.count({
        where: { callId: httpCallId, endedAt: null },
      })), 2);
      assert.equal(await completedAudit(), 0);

      process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "0";
      const stillDenied = await finish();
      assert.equal(stillDenied.statusCode, 403);
      assert.equal(stillDenied.json().error, "central_action_not_supported");
      process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "1";

      const active = await db.technicianSession.findMany({
        where: { callId: httpCallId, endedAt: null },
        orderBy: { id: "asc" },
      });
      assert.equal(active.length, 2);
      const finished = await finish({
        notes: "Completion with one technician continuing",
        followUpSessionIds: [active[0].id],
      });
      assert.equal(finished.statusCode, 200, finished.body);
      assert.equal(finished.json().status, "post_maintenance");
      assert.equal(await completedAudit(), 1);
      assert.equal((await db.technicianSession.count({
        where: { callId: httpCallId, endedAt: null, phase: "follow_up" },
      })), 1);
      assert.equal((await db.technicianSession.count({
        where: { callId: httpCallId, endedAt: null, phase: "maintenance" },
      })), 0);
      const completedCall = await db.andonCall.findUniqueOrThrow({
        where: { id: httpCallId },
      });
      assert(completedCall.maintenanceCompletedAt instanceof Date);
      assert(completedCall.attendanceMinutes >= 0);
      const duplicateFinish = await finish();
      assert.equal(duplicateFinish.statusCode, 409);
      assert.equal(duplicateFinish.json().error, "call_state_changed");
      assert.equal(await completedAudit(), 1);
      console.log("SEC-04/2F completion PASS: station ownership, machine scope, CSRF, rollback, follow-up and replay");

      // SEC-04/2G: the same real call returns from selected follow-up to
      // maintenance and preserves technician cycle and timing.
      const previousReturnFlag = process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED;
      process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "1";
      const returnPath = "/api/andon-calls/" + httpCallId + "/return-to-maintenance";
      const sendReturn = (body = { reason: "Maintenance resumed" }, extraHeaders = {}) =>
        httpApp.inject({ method: "PATCH", url: returnPath,
          headers: { ...headers, ...extraHeaders }, payload: body });
      const returnAudit = () => db.auditEvent.count({
        where: { resourceType: "andon_call", resourceId: httpCallId,
          action: "calls.returnToMaintenance" },
      });
      try {
        const missingReturnPermission = await sendReturn();
        assert.equal(missingReturnPermission.statusCode, 403);
        await db.accessPermission.create({
          data: { userId, key: "calls.returnToMaintenance" },
        });
        assert.equal((await sendReturn(undefined,
          { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
        assert.equal((await sendReturn(undefined, { cookie: "" })).statusCode, 401);
        assert.equal((await sendReturn({ reason: "ok", privilege: true })).statusCode, 400);

        await db.accessMachine.delete({
          where: { userId_machineId: { userId, machineId } },
        });
        const scopeDenied = await sendReturn();
        assert.equal(scopeDenied.statusCode, 404);
        await db.accessMachine.create({ data: { userId, machineId } });
        await assert.rejects(runCentralReturnToMaintenance(db, {
          token, workstationId: stationId, callId: httpCallId,
          reason: "Rejected failed audit", ipAddress: "x".repeat(46),
        }));
        assert.equal((await db.andonCall.findUniqueOrThrow({
          where: { id: httpCallId },
        })).status, "post_maintenance");
        assert.equal((await db.technicianSession.count({
          where: { callId: httpCallId, endedAt: null, phase: "follow_up" },
        })), 1);
        assert.equal(await returnAudit(), 0);
        process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "0";
        const disabledReturn = await sendReturn();
        assert.equal(disabledReturn.statusCode, 403);
        assert.equal(disabledReturn.json().error, "central_action_not_supported");
        process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "1";

        const returned = await sendReturn({ reason: "Next maintenance cycle" });
        assert.equal(returned.statusCode, 200, returned.body);
        assert.equal(returned.json().status, "in_progress");
        assert.equal(returned.json().maintenanceReturnCount, 1);
        assert.equal(await returnAudit(), 1);
        const activeMaintenance = await db.technicianSession.findMany({
          where: { callId: httpCallId, endedAt: null, phase: "maintenance" },
        });
        assert.equal(activeMaintenance.length, 1);
        assert.equal(activeMaintenance[0].cycleIndex, 2);
        assert.equal(activeMaintenance[0].workstationId, stationId);
        assert.equal((await db.technicianSession.count({
          where: { callId: httpCallId, endedAt: null, phase: "follow_up" },
        })), 0);
        const resumedCall = await db.andonCall.findUniqueOrThrow({
          where: { id: httpCallId },
        });
        assert(resumedCall.currentAttendanceStartedAt instanceof Date);
        assert(resumedCall.postMaintenanceMinutes >= 0);
        const replayReturn = await sendReturn();
        assert.equal(replayReturn.statusCode, 409);
        assert.equal(replayReturn.json().error, "call_state_changed");
        assert.equal(await returnAudit(), 1);
        console.log("SEC-04/2G return PASS: ACL, scope, CSRF, rollback, resumed technician, cycle & replay");
      } finally {
        if (previousReturnFlag === undefined)
          delete process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED;
        else process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = previousReturnFlag;
      }
    } finally {
      if (completionFlag === undefined)
        delete process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED;
      else process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = completionFlag;
      if (beforeSettings)
        await db.systemSettings.update({
          where: { id: "global" },
          data: {
            restrictMaintenanceCompletionToAttendanceWorkstation:
              beforeSettings.restrictMaintenanceCompletionToAttendanceWorkstation,
          },
        });
      else
        await db.systemSettings.delete({ where: { id: "global" } });
    }
  } finally {
    await httpApp.close();
    if (previousCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousCentral;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = previousFlag;
    if (previousOrigin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
    else process.env.ANDON_ACCESS_ORIGIN = previousOrigin;
    await db.technicianSession.deleteMany({ where: { callId: httpCallId } });
    await db.andonCall.delete({ where: { id: httpCallId } });
    await db.machine.update({ where: { id: machineId },
      data: { currentCallId: null, andonStatus: "normal" } });
  }
  console.log("SEC-04/2D central HTTP attendance PASS: selected scope, dual PIN, CSRF, opt-in off, atomic audit, replay");

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
  assert.equal(winner.maintenanceReturnCount, 0);

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
