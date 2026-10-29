import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashCredential } from "../dist/security/technicianCredentials.js";
import { lockMachineFlow } from "../dist/db/machineFlowLock.js";
import { verifyCentralAttendanceTechnician } from "../dist/access/centralVerifiedTechnicianAttendance.js";

if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1")
  throw Error("SEC-04/2A.9a integration requires isolated andon_test only");

const db = new PrismaClient();
const nonce = randomUUID().slice(0, 12);
const machineId = `ci-central-tech-${nonce}`;
const technicianId = `ci-central-tech-${nonce}`;
const pin = String(randomInt(10_000_000, 99_999_999));
const identity = { method: "pin", value: pin };
let callId = null;
let secondCallId = null;

try {
  await db.machine.create({
    data: { id: machineId, name: "SEC-04 isolated technician guard", isActive: true },
  });
  await db.technician.create({
    data: {
      id: technicianId, employeeId: `ci-central-${nonce}`,
      name: `Technician CI ${nonce}`, technicalArea: "mechanical",
      active: true, pinHash: await hashCredential(pin),
    },
  });
  const first = await db.andonCall.create({
    data: {
      machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date(),
    },
  });
  callId = first.id;
  const call = { callId: first.id, machineId, category: "maintenance", status: "open" };
  async function check(credential = identity, expected = undefined) {
    return db.$transaction(async (tx) => {
      await lockMachineFlow(tx, machineId);
      const result = verifyCentralAttendanceTechnician(tx, call, credential);
      if (expected) {
        await assert.rejects(result, (e) => e?.code === expected);
        return null;
      }
      return result;
    });
  }
  assert.equal((await check()).id, technicianId);
  await check({ method: "pin", value: "00000000" }, "technician_credential_invalid");
  const activeSession = await db.technicianSession.create({
    data: {
      callId, machineId, technicianId, technicianName: `Technician CI ${nonce}`,
      phase: "maintenance", startedAt: new Date(),
    },
  });
  await check(identity, "technician_already_attending");
  await db.technicianSession.update({
    where: { id: activeSession.id }, data: { endedAt: new Date() },
  });
  assert.equal((await check()).id, technicianId);

  const other = await db.andonCall.create({
    data: {
      machineId, category: "maintenance", subtype: "mechanical",
      status: "open", criticality: "medium", openedAt: new Date(),
    },
  });
  secondCallId = other.id;
  await db.technicianSession.create({
    data: {
      callId: secondCallId, machineId,
      technicianId: null, technicianName: `Technician CI ${nonce}`,
      phase: "maintenance", startedAt: new Date(),
    },
  });
  await check(identity, "technician_already_attending");
  await db.technicianSession.deleteMany({ where: { callId: secondCallId } });
  await db.technician.update({ where: { id: technicianId }, data: { active: false } });
  await check(identity, "technician_credential_invalid");
  console.log("SEC-04/2A.9a PG PASS: valid PIN, invalid PIN, exclusive session, legacy name session, inactive technician");
} finally {
  if (callId || secondCallId) {
    const ids = [callId, secondCallId].filter(Boolean);
    await db.technicianSession.deleteMany({ where: { callId: { in: ids } } });
    await db.andonCall.deleteMany({ where: { id: { in: ids } } });
  }
  await db.technician.deleteMany({ where: { id: technicianId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.$disconnect();
}
