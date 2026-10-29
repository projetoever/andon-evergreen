import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { hashCredential } from "../security/technicianCredentials.js";
import { AccessError } from "./policy.js";
import { verifyCentralAttendanceTechnicians } from "./centralMultiTechnicianVerification.js";

const c1 = { method: "pin", value: "762814" };
const c2 = { method: "pin", value: "841236" };
const hash1 = await hashCredential(c1.value);
const hash2 = await hashCredential(c2.value);
const call = { callId: "call-37", machineId: "37", category: "maintenance", status: "open" as const };

function fixture(options: {
  revokeSecond?: boolean;
  areaMismatch?: boolean;
  busyLegacy?: boolean;
  busyOther?: boolean;
  wrongCallStatus?: boolean;
} = {}) {
  const log: string[] = [];
  let lookup = 0;
  const technicians = [
    { id: "tech-z", employeeId: "B", name: "Bruna", active: true, pinHash: hash1,
      tagHash: null, technicalArea: "mechanical", technicalAreas: [], shiftId: null, shift: null },
    { id: "tech-a", employeeId: "A", name: "Ana", active: true, pinHash: hash2,
      tagHash: null, technicalArea: options.areaMismatch ? "electrical" : "mechanical",
      technicalAreas: [], shiftId: null, shift: null },
  ];
  const tx = {
    technician: {
      findMany: async () => {
        lookup++;
        log.push("pin");
        return options.revokeSecond && lookup >= 3
          ? [technicians[0]] : technicians;
      },
    },
    $queryRaw: async () => { log.push("technician-lock"); return [{ lockResult: "" }]; },
    andonCall: {
      findUnique: async () => {
        log.push("call-state");
        return { machineId: "37", category: "maintenance", subtype: "mechanical",
          status: options.wrongCallStatus ? "in_progress" : "open", isSystemTest: false };
      },
    },
    technicianSession: {
      findMany: async (query: { where: { OR: unknown[]; endedAt: null } }) => {
        log.push("sessions");
        assert.equal(query.where.endedAt, null);
        assert.deepEqual(query.where.OR[0], { technicianId: { in: ["tech-a", "tech-z"] } });
        assert.equal(query.where.OR.length, 3);
        return options.busyLegacy
          ? [{ callId: "legacy", technicianId: null, technicianName: "ANA" }]
          : options.busyOther
            ? [{ callId: "other", technicianId: "tech-z", technicianName: "Bruna" }]
            : [];
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, log };
}

async function denied(p: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(p, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}

test("2A.9b2a: verifies two PINs, takes sorted locks, keeps credential order", async () => {
  const f = fixture();
  const result = await verifyCentralAttendanceTechnicians(f.tx, call, [c1, c2]);
  assert.deepEqual(result.map((x) => x.id), ["tech-z", "tech-a"]);
  assert.deepEqual(f.log, [
    "pin", "pin", "technician-lock", "technician-lock", "pin", "pin",
    "call-state", "sessions",
  ]);
  assert(!JSON.stringify(result).includes(c1.value));
  assert(!JSON.stringify(result).includes(c2.value));
});
test("2A.9b2a: duplicate PIN and duplicate identity cannot cause partial attendance", async () => {
  const f = fixture();
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, c1]), "duplicate_technician", 409);
  assert(!f.log.includes("technician-lock"));
});
test("2A.9b2a: one invalid credential, empty or oversized group fails closed", async () => {
  const f = fixture();
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, []), "technician_credentials_invalid", 400);
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, Array(7).fill(c1)), "technician_credentials_invalid", 400);
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, { method: "name", value: "Ana" }]), "technician_credential_required", 400);
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, { method: "pin", value: "101010" }]), "technician_credential_invalid");
  assert(!f.log.includes("technician-lock"));
});
test("2A.9b2a: technician credential revocation between acquisition and reload fails", async () => {
  const f = fixture({ revokeSecond: true });
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, c2]), "technician_credential_invalid");
  assert(!f.log.includes("sessions"));
});
test("2A.9b2a: all areas and call state must match", async () => {
  const f = fixture({ areaMismatch: true });
  await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, c2]), "technician_area_denied");
  assert(!f.log.includes("sessions"));
  const changed = fixture({ wrongCallStatus: true });
  await denied(verifyCentralAttendanceTechnicians(changed.tx, call, [c1, c2]), "call_state_changed", 409);
});
test("2A.9b2a: active legacy-name and cross-call sessions deny entire group", async () => {
  for (const opts of [{ busyLegacy: true }, { busyOther: true }]) {
    const f = fixture(opts);
    await denied(verifyCentralAttendanceTechnicians(f.tx, call, [c1, c2]), "technician_already_attending", 409);
  }
});
