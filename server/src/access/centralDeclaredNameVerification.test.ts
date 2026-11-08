import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { AccessError } from "./policy.js";
import {
  parseDeclaredTechnicianNames,
  resolveCentralDeclaredNameAttendanceCandidates,
} from "./centralDeclaredNameVerification.js";

const call = {
  callId: "call-37",
  machineId: "37",
  category: "maintenance",
  status: "open" as const,
};

function fixture(options: {
  missing?: boolean;
  ambiguous?: boolean;
  identityChanged?: boolean;
  wrongArea?: boolean;
  stateChanged?: boolean;
  systemTest?: boolean;
  busy?: boolean;
  busyLegacy?: boolean;
} = {}) {
  const log: string[] = [];
  let technicianReads = 0;
  const ana = {
    id: "tech-a", name: "Ana", employeeId: "A", active: true,
    technicalArea: options.wrongArea ? "electrical" : "mechanical",
    technicalAreas: [], shiftId: null, shift: null, pinHash: null, tagHash: null,
  };
  const bruna = {
    id: "tech-z", name: "Bruna", employeeId: "B", active: true,
    technicalArea: "mechanical", technicalAreas: [], shiftId: null,
    shift: null, pinHash: null, tagHash: null,
  };
  const tx = {
    technician: {
      findMany: async (query: { where: { active: boolean; OR: unknown[] } }) => {
        technicianReads++;
        log.push("catalog");
        assert.equal(query.where.active, true);
        assert.equal(query.where.OR.length, 2);
        if (options.missing) return [bruna];
        if (options.ambiguous) return [ana, { ...ana, id: "tech-b" }, bruna];
        if (options.identityChanged && technicianReads > 1)
          return [{ ...ana, id: "tech-new" }, bruna];
        return [ana, bruna];
      },
    },
    $queryRaw: async () => { log.push("technician-lock"); return []; },
    andonCall: {
      findUnique: async () => {
        log.push("call-state");
        return {
          machineId: "37", category: "maintenance",
          status: options.stateChanged ? "in_progress" : "open",
          subtype: "mechanical", isSystemTest: Boolean(options.systemTest),
        };
      },
    },
    technicianSession: {
      findMany: async (query: {
        where: { endedAt: null; OR: Array<Record<string, unknown>> };
      }) => {
        log.push("sessions");
        assert.equal(query.where.endedAt, null);
        assert.deepEqual(query.where.OR[0], { technicianId: { in: ["tech-a", "tech-z"] } });
        assert.equal(query.where.OR.length, 3);
        if (options.busy)
          return [{ callId: "other", technicianId: "tech-a", technicianName: "Ana" }];
        if (options.busyLegacy)
          return [{ callId: "legacy", technicianId: null, technicianName: "ANA" }];
        return [];
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, log };
}

async function denied(promise: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}

test("R12-02A: name selection is explicitly a declaration, never verified PIN/RFID", async () => {
  const { tx, log } = fixture();
  const selected = await resolveCentralDeclaredNameAttendanceCandidates(
    tx, call, ["bruna", "ANA"],
  );
  assert.deepEqual(selected.map((tech) => tech.id), ["tech-z", "tech-a"]);
  assert(selected.every((tech) =>
    tech.identificationMethod === "name" && tech.identityVerified === false));
  assert.deepEqual(log, [
    "catalog", "technician-lock", "technician-lock", "catalog", "call-state", "sessions",
  ]);
  assert(!JSON.stringify(selected).includes("pinHash"));
  assert(!JSON.stringify(selected).includes("tagHash"));
});

test("R12-02A: malformed, blank, duplicate and oversized selections deny before lookup", () => {
  for (const input of [
    null, "Ana", [], Array(7).fill("Ana"), ["Ana", ""], ["Ana", 15],
    ["Ana", "Ana"], ["ANA", "ana"], ["A"], ["Ana\nSilva"],
    ["A".repeat(121)],
  ]) {
    assert.throws(() => parseDeclaredTechnicianNames(input), AccessError);
  }
  assert.deepEqual(parseDeclaredTechnicianNames([" Ana ", "Bruna"]), ["Ana", "Bruna"]);
});

test("R12-02A: missing or ambiguous active catalog identity denies all", async () => {
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    fixture({ missing: true }).tx, call, ["Ana", "Bruna"],
  ), "technician_not_found", 404);
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    fixture({ ambiguous: true }).tx, call, ["Ana", "Bruna"],
  ), "technician_name_ambiguous", 409);
});

test("R12-02A: renamed/replaced identity during lock acquisition is rejected", async () => {
  const { tx, log } = fixture({ identityChanged: true });
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    tx, call, ["Ana", "Bruna"],
  ), "technician_identity_changed", 409);
  assert(!log.includes("call-state"));
});

test("R12-02A: area, state, system test and nonmaintenance calls are rejected", async () => {
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    fixture({ wrongArea: true }).tx, call, ["Ana", "Bruna"],
  ), "technician_area_denied");
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    fixture({ stateChanged: true }).tx, call, ["Ana", "Bruna"],
  ), "call_state_changed", 409);
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    fixture({ systemTest: true }).tx, call, ["Ana", "Bruna"],
  ), "system_test_transition_denied");
  const { tx, log } = fixture();
  await denied(resolveCentralDeclaredNameAttendanceCandidates(
    tx, { ...call, category: "quality" }, ["Ana", "Bruna"],
  ), "maintenance_call_required", 409);
  assert.equal(log.length, 0);
});

test("R12-02A: busy technician including legacy name-only sessions blocks entire group", async () => {
  for (const option of [{ busy: true }, { busyLegacy: true }]) {
    const { tx, log } = fixture(option);
    await denied(resolveCentralDeclaredNameAttendanceCandidates(
      tx, call, ["Ana", "Bruna"],
    ), "technician_already_attending", 409);
    assert.equal(log.at(-1), "sessions");
  }
});
