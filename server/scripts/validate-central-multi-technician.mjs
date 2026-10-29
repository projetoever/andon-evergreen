import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { verifyCentralAttendanceTechnicians } from "../dist/access/centralMultiTechnicianVerification.js";
import { applyVerifiedCentralAttendanceDomainTransitionMany } from "../dist/routes/andonCalls.js";
import { lockWorkstationFlow } from "../dist/db/workstationFlowLock.js";
import { lockMachineFlow } from "../dist/db/machineFlowLock.js";

if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("Isolated andon_test only, with central writes disabled");

const db = new PrismaClient();
const suffix = randomUUID().slice(0, 12);
const workstationId = `ws_${randomUUID()}`;
const machineId = `ci-group-${suffix}`;
const techIds = [`ci-group-tech-a-${suffix}`, `ci-group-tech-b-${suffix}`];
const pins = [String(randomInt(10000000, 99999999)), String(randomInt(10000000, 99999999))];
const credentials = pins.map((value) => ({ method: "pin", value }));
const callIds = [];
try {
  await db.workstation.create({ data: { id: workstationId, active: true, pendingApproval: false, allowOperational: true } });
  await db.machine.create({ data: { id: machineId, name: "Synthetic group machine", isActive: true } });
  for (const [i, id] of techIds.entries()) {
    await db.technician.create({
      data: {
        id, employeeId: `multi-${suffix}-${i}`, name: `Multi technician ${i} ${suffix}`,
        active: true, technicalArea: "mechanical", pinHash: await hashCredential(pins[i]),
      },
    });
  }
  const first = await db.andonCall.create({
    data: { machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date() },
  });
  callIds.push(first.id);
  const context = { callId: first.id, machineId, category: "maintenance", status: "open" };

  async function attempt(ctx, group, failAtAudit = false, client = db) {
    return client.$transaction(async (tx) => {
      await lockWorkstationFlow(tx, workstationId);
      await lockMachineFlow(tx, machineId);
      const verified = await verifyCentralAttendanceTechnicians(tx, ctx, group);
      const result = await applyVerifiedCentralAttendanceDomainTransitionMany(tx, ctx, verified, workstationId);
      if (failAtAudit) throw Error("simulated audit failure");
      return result;
    }, { timeout: 30000 });
  }

  await assert.rejects(attempt(context, credentials, true), /simulated audit failure/);
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: first.id } })).status, "open");
  assert.equal(await db.technicianSession.count({ where: { callId: first.id } }), 0);
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).currentCallId, null);

  await assert.rejects(
    attempt(context, [credentials[0], { method: "pin", value: "00000000" }]),
    (error) => error?.code === "technician_credential_invalid",
  );
  assert.equal(await db.technicianSession.count({ where: { callId: first.id } }), 0);

  // Two actual independent PostgreSQL connections race on the same
  // workstation + machine. One commits; the loser must observe the new
  // call state after acquiring the advisory transaction lock.
  const contender = new PrismaClient();
  let attended;
  try {
    const results = await Promise.allSettled([
      attempt(context, credentials),
      attempt(context, [credentials[1], credentials[0]], false, contender),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1,
      "exactly one concurrent attempt must commit");
    assert.equal(results.filter((x) => x.status === "rejected").length, 1);
    const denied = results.find((x) => x.status === "rejected");
    assert.equal(denied.reason?.code, "call_state_changed");
    attended = results.find((x) => x.status === "fulfilled").value;
  } finally {
    await contender.$disconnect();
  }
  assert.equal(attended.status, "in_progress");
  assert(attended.attendedAt instanceof Date);
  assert.deepEqual(attended.technicianNames, [
    `Multi technician 0 ${suffix}`, `Multi technician 1 ${suffix}`,
  ]);
  const saved = await db.technicianSession.findMany({
    where: { callId: first.id }, orderBy: { technicianId: "asc" },
  });
  assert.equal(saved.length, 2);
  assert.deepEqual(saved.map((x) => x.technicianId).sort(), [...techIds].sort());
  assert(saved.every((x) => x.workstationId === workstationId));
  assert(saved.every((x) => x.phase === "maintenance" && x.cycleIndex === 1));
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).andonStatus, "in_progress");

  const other = await db.andonCall.create({
    data: { machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date() },
  });
  callIds.push(other.id);
  const next = { callId: other.id, machineId, category: "maintenance", status: "open" };
  await assert.rejects(attempt(next, [credentials[1], credentials[0]]),
    (error) => error?.code === "technician_already_attending");
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: other.id } })).status, "open");
  console.log("SEC-04/2A.9b2a PostgreSQL PASS: group rollback, 2-connection race, invalid credential, 2 sessions, origin and exclusion");
} finally {
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  await db.technician.deleteMany({ where: { id: { in: techIds } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.workstation.deleteMany({ where: { id: workstationId } });
  await db.$disconnect();
}
