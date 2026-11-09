import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCallRoutes } from "../dist/routes/andonCalls.js";
import { runCentralDeclaredNameTechnicianAdd } from "../dist/access/centralDeclaredNameTechnicianAdd.js";

// No HML, industrial DB or production. Both distinct feature flags must
// start OFF; this isolated script turns them on only in its own process.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED === "1")
  throw Error("R12-02D requires ANDON_INTEGRATION_TEST=1, /andon_test and central flags OFF");

const db = new PrismaClient();
const otherClient = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machines = [0, 1, 2].map(i => "ci-add-declared-m" + i + "-" + n);
const stations = [0, 1].map(() => "ws_" + randomUUID());
const names = [0, 1].map(i => "CI Followup Name " + i + " " + n);
const technicianIds = [0, 1].map(i => "ci-add-declared-t" + i + "-" + n);
const tokens = [0, 1].map(() => randomBytes(32).toString("hex"));
const userIds = [];
const sessionIds = [];
const callIds = [];
const previous = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  nameAttendance: process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED,
  nameAdd: process.env.ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app;
const countSessions = callId => db.technicianSession.count({
  where: { callId, endedAt: null },
});
const readAudits = callId => db.auditEvent.findMany({
  where: { action: "calls.technicians.add.declared", resourceType: "andon_call", resourceId: callId },
});
function run(client, index, callId, selection, extra = {}) {
  return runCentralDeclaredNameTechnicianAdd(client, {
    token: tokens[index], workstationId: stations[index], callId,
    technicianNames: selection,
    requestId: "R12-02D-" + n, ipAddress: "127.0.0.1",
    ...extra,
  });
}
function restore(key, val) {
  if (val === undefined) delete process.env[key];
  else process.env[key] = val;
}
async function newCall(machineId, status) {
  const now = new Date();
  const result = await db.andonCall.create({ data: {
    machineId, category: "maintenance", subtype: "mechanical",
    status, criticality: "medium", openedAt: now,
    attendedAt: now,
    currentAttendanceStartedAt: status === "in_progress" ? now : null,
  } });
  callIds.push(result.id);
  return result.id;
}

try {
  await db.machine.createMany({ data: machines.map((id, index) => ({
    id, name: "CI declared followup m" + index, isActive: true,
  })) });
  await db.workstation.createMany({ data: stations.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 2; i++) {
    await db.technician.create({ data: {
      id: technicianIds[i], employeeId: technicianIds[i],
      name: names[i], active: true, technicalArea: "mechanical",
    } });
  }
  for (let i = 0; i < 2; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.declared.add." + i + "." + n, displayName: "CI declared add operator " + i,
      roleLabel: i === 0 ? "Production" : "Maintenance",
      accountType: "person", machineScope: "selected",
      passwordHash: "CI test no real password", mustChangePassword: false,
      permissions: { create: [{ key: "andon.read" }, { key: "calls.technicians.manage" }] },
      machines: { create: [{ machineId: machines[i] }, { machineId: machines[2] }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    const session = await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id, workstationId: stations[i],
      purpose: "normal", authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
    } });
    sessionIds.push(session.id);
  }
  const callA = await newCall(machines[0], "in_progress");
  const callB = await newCall(machines[1], "post_maintenance");
  const callC = await newCall(machines[2], "in_progress");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCallRoutes(app);

  function send(callId, index, technicianNames, headersExtra = {}, body = { technicianNames }) {
    return app.inject({
      method: "POST", url: "/api/andon-calls/" + callId + "/technicians-declared",
      headers: {
        origin: "https://andon.test", "x-andon-workstation-id": stations[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]),
        ...headersExtra,
      },
      payload: body,
    });
  }

  // Name attendance can be enabled while name-add remains DISABLED.
  const noIndependentFlag = await send(callC, 0, [names[1]]);
  assert.equal(noIndependentFlag.statusCode, 403, noIndependentFlag.body);
  assert.equal(noIndependentFlag.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED = "1";

  assert.equal((await send(callC, 0, [names[1]], { cookie: "" })).statusCode, 401);
  assert.equal((await send(callC, 0, [names[1]],
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send(callC, 0, [names[1]], {}, {
    technicianNames: [names[1]], identityVerified: true,
  })).statusCode, 400);
  assert.equal((await send(callC, 0, [names[1], names[1]])).statusCode, 409);
  assert.equal((await send(callC, 0, ["Unknown Tech " + n])).statusCode, 404);
  assert.equal((await send(callB, 0, [names[1]])).statusCode, 404,
    "selected-machine scope must forbid foreign call mutations");

  assert.equal(await countSessions(callC), 0);
  assert.equal((await readAudits(callC)).length, 0);

  // Two PostgreSQL clients/users/workstations race the same technician across
  // different machines. The losing transaction must not create a session.
  const race = await Promise.allSettled([
    run(db, 0, callA, [names[0]]),
    run(otherClient, 1, callB, [names[0]]),
  ]);
  assert.equal(race.filter(x => x.status === "fulfilled").length, 1, "exactly one winner");
  assert.equal(race.filter(x => x.status === "rejected").length, 1, "exactly one loser");
  const winnerIndex = race[0].status === "fulfilled" ? 0 : 1;
  const winnerId = winnerIndex === 0 ? callA : callB;
  const losingId = winnerIndex === 0 ? callB : callA;
  assert.equal(await db.technicianSession.count({
    where: { technicianId: technicianIds[0], endedAt: null },
  }), 1, "technician cannot be active on two calls");
  assert.equal(await countSessions(losingId), 0);
  assert.equal((await readAudits(losingId)).length, 0);
  const winnerAudits = await readAudits(winnerId);
  assert.equal(winnerAudits.length, 1);
  assert.equal(winnerAudits[0].actorUserId, userIds[winnerIndex]);
  assert.equal(winnerAudits[0].workstationId, stations[winnerIndex]);
  assert.equal(winnerAudits[0].reason, "operator_selected_name");
  assert.equal(winnerAudits[0].after.identificationMethod, "name");
  assert.equal(winnerAudits[0].after.identityVerified, false);
  assert.equal(winnerAudits[0].after.declaredByUserId, userIds[winnerIndex]);
  assert.deepEqual(winnerAudits[0].after.technicianIds, [technicianIds[0]]);
  assert(!JSON.stringify(winnerAudits).includes(tokens[winnerIndex]));

  // The same technician must not join the very same call twice.
  await assert.rejects(run(db, winnerIndex, winnerId, [names[0]]));
  assert.equal((await readAudits(winnerId)).length, 1);

  // Force an audit insertion failure *after* the domain session is created.
  // PostgreSQL enforces varchar(45) for audit IP, rolling the entire tx back.
  await assert.rejects(run(db, 0, callC, [names[1]], { ipAddress: "x".repeat(46) }));
  assert.equal(await countSessions(callC), 0, "audit failure must rollback the session");
  assert.equal((await readAudits(callC)).length, 0, "audit failure leaves no success event");
  assert.deepEqual((await db.andonCall.findUniqueOrThrow({
    where: { id: callC },
  })).technicianNames, [], "audit failure must rollback technician names");

  const added = await send(callC, 0, [names[1]]);
  assert.equal(added.statusCode, 201, added.body);
  assert.equal(await countSessions(callC), 1);
  assert.equal((await readAudits(callC)).length, 1);
  assert.equal((await send(callC, 0, [names[1]])).statusCode, 409, "replay must be denied");
  const cSession = await db.technicianSession.findFirstOrThrow({
    where: { callId: callC, technicianId: technicianIds[1], endedAt: null },
  });
  assert.equal(cSession.phase, "maintenance");
  assert.equal(cSession.workstationId, stations[0]);

  // Follow-up specific phase + audit for second name when free. The winning
  // race may have used callB, so use the opposing call only when still empty.
  const followCall = callB;
  if (winnerId !== followCall) {
    // This test uses a new independent technician record to avoid the active
    // exclusivity guard; names[1] is already active on callC.
    await db.technicianSession.updateMany({
      where: { callId: callC, technicianId: technicianIds[1], endedAt: null },
      data: { endedAt: new Date() },
    });
    const follow = await send(followCall, 1, [names[1]]);
    assert.equal(follow.statusCode, 201, follow.body);
    const followSession = await db.technicianSession.findFirstOrThrow({
      where: { callId: followCall, technicianId: technicianIds[1], endedAt: null },
    });
    assert.equal(followSession.phase, "follow_up");
  }

  process.env.ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED = "0";
  assert.equal((await send(callC, 0, [names[1]])).statusCode, 403);
  process.env.ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED = "1";
  await db.accessSession.update({ where: { id: sessionIds[0] },
    data: { revokedAt: new Date() } });
  assert.equal((await send(callC, 0, [names[1]])).statusCode, 401);

  console.log("R12-02D declared add PG PASS: independent OFF flag, HTTP ACL+CSRF, two PostgreSQL workstations race, audit rollback, follow-up phase, replay and revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", previous.central);
  restore("ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED", previous.nameAttendance);
  restore("ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED", previous.nameAdd);
  restore("ANDON_ACCESS_ORIGIN", previous.origin);
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  for (const id of userIds) {
    await db.accessSession.deleteMany({ where: { userId: id } });
    await db.accessMachine.deleteMany({ where: { userId: id } });
    await db.accessPermission.deleteMany({ where: { userId: id } });
    await db.accessUser.update({ where: { id }, data: { active: false } });
  }
  await db.technician.deleteMany({ where: { id: { in: technicianIds } } });
  await db.machine.deleteMany({ where: { id: { in: machines } } });
  await db.workstation.deleteMany({ where: { id: { in: stations } } });
  await otherClient.$disconnect();
  await db.$disconnect();
}
