import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { hashCredential } from "../security/technicianCredentials.js";
import { AccessError } from "./policy.js";
import { verifyCentralAttendanceTechnician } from "./centralVerifiedTechnicianAttendance.js";

const PIN = "736281";
const OTHER_PIN = "998311";
const goodHash = await hashCredential(PIN);
const otherHash = await hashCredential(OTHER_PIN);
const call = { callId: "call-37", machineId: "37", category: "maintenance", status: "open" as const };
type TestOptions = {
  invalidCredential?: boolean;
  deactivatedAfterLock?: boolean;
  rotatedAfterLock?: boolean;
  wrongArea?: boolean;
  callStatus?: string;
  systemTest?: boolean;
  crossMachine?: boolean;
  activeSession?: "same" | "other" | "legacy";
};
function fixture(options: TestOptions = {}) {
  const log: string[] = [];
  let technicianReads = 0;
  const tx = {
    technician: {
      findMany: async (args: { where: { active: boolean } }) => {
        log.push("credential-lookup");
        assert.equal(args.where.active, true);
        technicianReads++;
        if (options.deactivatedAfterLock && technicianReads > 1) return [];
        return [{
          id: "tech-1",
          employeeId: "EMP001",
          name: "Ana",
          active: true,
          pinHash: options.invalidCredential || (options.rotatedAfterLock && technicianReads > 1)
            ? otherHash : goodHash,
          tagHash: null,
          technicalArea: options.wrongArea ? "electrical" : "mechanical",
          technicalAreas: [],
          shiftId: null, shift: null,
        }];
      },
    },
    andonCall: {
      findUnique: async (args: { where: { id: string } }) => {
        log.push("call-after-technician-lock");
        assert.equal(args.where.id, "call-37");
        return {
          machineId: options.crossMachine ? "39" : "37",
          category: "maintenance",
          subtype: "mechanical",
          status: options.callStatus ?? "open",
          isSystemTest: options.systemTest ?? false,
        };
      },
    },
    technicianSession: {
      findMany: async (args: { where: {
        endedAt: null;
        OR: Array<{ technicianId?: string | null; technicianName?: { equals: string; mode: string } }>;
      } }) => {
        log.push("exclusive-session-query");
        assert.equal(args.where.endedAt, null);
        assert.equal(args.where.OR[0].technicianId, "tech-1");
        assert.deepEqual(args.where.OR[1], {
          technicianId: null, technicianName: { equals: "Ana", mode: "insensitive" },
        });
        if (!options.activeSession) return [];
        return [{
          callId: options.activeSession === "same" ? "call-37" : "call-39",
          machineId: options.activeSession === "same" ? "37" : "39",
          technicianId: options.activeSession === "legacy" ? null : "tech-1",
          technicianName: options.activeSession === "legacy" ? "ANA" : "Ana",
        }];
      },
    },
    $queryRaw: async () => {
      log.push("technician-lock");
      return [{ lockResult: "" }];
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, log };
}
async function denied(promise: Promise<unknown>, code: string, status = 403) {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof AccessError && error.code === code && error.statusCode === status);
}
const credential = { method: "pin", value: PIN };
test("SEC-04/2A.9a: verifies PIN twice around technician lock and checks area/exclusivity", async () => {
  const { tx, log } = fixture();
  const technician = await verifyCentralAttendanceTechnician(tx, call, credential);
  assert.deepEqual(technician, { id: "tech-1", name: "Ana", employeeId: "EMP001" });
  assert.deepEqual(log, [
    "credential-lookup", "technician-lock", "credential-lookup",
    "call-after-technician-lock", "exclusive-session-query",
  ]);
  assert(!JSON.stringify(technician).includes(PIN), "no secret leaves guard");
});

test("SEC-04/2A.9a: invalid and name-only credentials are rejected before technician lock", async () => {
  const missing = fixture();
  await denied(verifyCentralAttendanceTechnician(missing.tx, call, { method: "name", value: "Ana" }), "technician_credential_required", 400);
  assert.deepEqual(missing.log, []);
  const invalid = fixture({ invalidCredential: true });
  await denied(verifyCentralAttendanceTechnician(invalid.tx, call, credential), "technician_credential_invalid");
  assert.deepEqual(invalid.log, ["credential-lookup"]);
});
test("SEC-04/2A.9a: technician deactivated or PIN rotated during lock wait cannot attend", async () => {
  const inactive = fixture({ deactivatedAfterLock: true });
  await denied(verifyCentralAttendanceTechnician(inactive.tx, call, credential), "technician_credential_invalid");
  assert.equal(inactive.log.includes("exclusive-session-query"), false);
  const rotated = fixture({ rotatedAfterLock: true });
  await denied(verifyCentralAttendanceTechnician(rotated.tx, call, credential), "technician_credential_invalid");
  assert.deepEqual(rotated.log.slice(0, 3), ["credential-lookup", "technician-lock", "credential-lookup"]);
});
test("SEC-04/2A.9a: maintenance category, machine, status and subtype must match server state", async () => {
  const production = fixture();
  await denied(verifyCentralAttendanceTechnician(production.tx, {
    ...call, category: "production",
  }, credential), "maintenance_call_required", 409);
  assert.deepEqual(production.log, []);
  const moved = fixture({ crossMachine: true });
  await denied(verifyCentralAttendanceTechnician(moved.tx, call, credential), "call_not_found", 404);
  const closed = fixture({ callStatus: "in_progress" });
  await denied(verifyCentralAttendanceTechnician(closed.tx, call, credential), "call_state_changed", 409);
  const testCall = fixture({ systemTest: true });
  await denied(verifyCentralAttendanceTechnician(testCall.tx, call, credential), "system_test_transition_denied");
  const area = fixture({ wrongArea: true });
  await denied(verifyCentralAttendanceTechnician(area.tx, call, credential), "technician_area_denied");
  assert.equal(area.log.includes("exclusive-session-query"), false);
});
test("SEC-04/2A.9a: same-call, other-call and historical name-only active session block re-attendance", async () => {
  for (const type of ["same", "other", "legacy"] as const) {
    const { tx, log } = fixture({ activeSession: type });
    await denied(verifyCentralAttendanceTechnician(tx, call, credential), "technician_already_attending", 409);
    assert.equal(log.at(-1), "exclusive-session-query");
  }
});
