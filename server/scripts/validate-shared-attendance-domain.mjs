import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { verifyCentralAttendanceTechnician } from "../dist/access/centralVerifiedTechnicianAttendance.js";
import { applyVerifiedCentralAttendanceDomainTransition } from "../dist/routes/andonCalls.js";
import { lockMachineFlow } from "../dist/db/machineFlowLock.js";
import { lockWorkstationFlow } from "../dist/db/workstationFlowLock.js";

if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("SEC-04/2A.9b1 requires isolated andon_test and central writes disabled");

const db = new PrismaClient();
const n = randomUUID().slice(0, 12);
const stationId = `ws_${randomUUID()}`;
const machineId = `ci-shared-attendance-${n}`;
const technicianId = `ci-shared-technician-${n}`;
const pin = String(randomInt(10000000, 99999999));
const credential = { method: "pin", value: pin };
const callIds = [];

try {
  await db.workstation.create({ data: { id: stationId, active: true, pendingApproval: false, allowOperational: true } });
  await db.machine.create({ data: { id: machineId, name: "Shared attendance isolated", isActive: true } });
  await db.technician.create({
    data: {
      id: technicianId,
      employeeId: `shared-${n}`,
      name: `Shared technician ${n}`,
      technicalArea: "mechanical",
      active: true,
      pinHash: await hashCredential(pin),
    },
  });
  const first = await db.andonCall.create({
    data: { machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date() },
  });
  callIds.push(first.id);
  const context = { callId: first.id, machineId, category: "maintenance", status: "open" };

  async function attempt(ctx, rollback = false) {
    return db.$transaction(async (tx) => {
      // Same order as the central guard, excluding user lock in this domain-only test.
      await lockWorkstationFlow(tx, stationId);
      await lockMachineFlow(tx, ctx.machineId);
      const technician = await verifyCentralAttendanceTechnician(tx, ctx, credential);
      const result = await applyVerifiedCentralAttendanceDomainTransition(tx, ctx, technician, stationId);
      if (rollback) throw new Error("synthetic audit persistence failure");
      return result;
    }, { timeout: 20000 });
  }

  await assert.rejects(attempt(context, true), /synthetic audit persistence failure/);
  const afterRollback = await db.andonCall.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(afterRollback.status, "open", "failed audit must not persist attendance state");
  assert.equal(await db.technicianSession.count({ where: { callId: first.id } }), 0,
    "failed audit must not leave a technician session");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: machineId } })).currentCallId, null);

  const completed = await attempt(context);
  assert.equal(completed.status, "in_progress");
  assert(completed.attendedAt instanceof Date);
  assert(completed.currentAttendanceStartedAt instanceof Date);
  assert.equal(completed.technicianName, `Shared technician ${n}`);
  assert.deepEqual(completed.technicianNames, [`Shared technician ${n}`]);
  const sessions = await db.technicianSession.findMany({ where: { callId: first.id } });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].technicianId, technicianId);
  assert.equal(sessions[0].workstationId, stationId);
  assert.equal(sessions[0].phase, "maintenance");
  assert.equal(sessions[0].cycleIndex, 1);
  const currentMachine = await db.machine.findUniqueOrThrow({ where: { id: machineId } });
  assert.equal(currentMachine.currentCallId, first.id);
  assert.equal(currentMachine.andonStatus, "in_progress");

  // The technician remains assigned to the first call; a second call is
  // rejected without changing its state, reproducing the legacy exclusivity.
  const second = await db.andonCall.create({
    data: { machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date() },
  });
  callIds.push(second.id);
  const otherContext = { callId: second.id, machineId, category: "maintenance", status: "open" };
  await assert.rejects(attempt(otherContext), (error) => error?.code === "technician_already_attending");
  assert.equal((await db.andonCall.findUniqueOrThrow({ where: { id: second.id } })).status, "open");

  console.log("SEC-04/2A.9b1 PostgreSQL PASS: atomic rollback, attendance fields, technician session, source workstation, machine sync, exclusive technician");
} finally {
  await db.technicianSession.deleteMany({ where: { callId: { in: callIds } } });
  await db.andonCall.deleteMany({ where: { id: { in: callIds } } });
  await db.technician.deleteMany({ where: { id: technicianId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.workstation.deleteMany({ where: { id: stationId } });
  await db.$disconnect();
}
