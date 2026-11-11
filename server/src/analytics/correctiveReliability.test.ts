import assert from "node:assert/strict";
import test from "node:test";
import { buildAssetReliability, type ReliabilityCallRecord } from "./reliability.js";

const at = (value: string) => new Date(value);
const makeCall = (
  id: string,
  nature: string | null,
  diagnosis: string | null,
  returns: number,
): ReliabilityCallRecord => ({
  id, machineId: "m37", status: "finished",
  openedAt: at("2026-11-11T10:00:00Z"),
  finishedAt: at("2026-11-11T10:45:00Z"),
  failureClassification: diagnosis,
  failureResponsibility: "maintenance",
  analyticsDisposition: "include", maintenanceReturnCount: returns,
  callReasonSnapshot: nature === null ? null : {
    nature,
    maintenanceKpiPolicy: nature === "corrective_failure" ? "eligible" : "excluded",
    analyticsDisposition: "include",
  },
});

test("S4-E: Setup service stays in operational volumes/downtime but does not inflate corrective returns", () => {
  const result = buildAssetReliability({
    machines: [{ id: "m37", name: "Máquina 37", isActive: true, createdAt: at("2026-11-10T12:00:00Z") }],
    calls: [
      makeCall("repair", "corrective_failure", "mechanical", 1),
      makeCall("setup", "planned_setup", "mechanical", 4),
      makeCall("support", "production_support", null, 2),
    ],
    failureEvents: [{
      id: "f1", machineId: "m37", startedAt: at("2026-11-11T10:00:00Z"),
      endedAt: at("2026-11-11T10:20:00Z"), classification: "mechanical", callId: "setup",
    }],
    activeCalls: null, activeSessions: null,
    start: at("2026-11-11T09:00:00Z"), effectiveEnd: at("2026-11-11T11:00:00Z"),
  });
  const asset = result.assets[0];
  assert.equal(asset.callsOpened, 3);
  assert.equal(asset.callsFinished, 3);
  assert.equal(asset.maintenanceReturnCycles, 1);
  assert.equal(asset.repeatDiagnosisCount, 0);
  assert.deepEqual(asset.topDiagnosis, { classification: "mechanical", count: 1 });
  assert.equal(asset.downtimeMinutes, 20);
  assert.equal(asset.physicalStopEpisodes, 1);
  assert.equal(result.dataHealth.finishedCallsMissingClassification, 0);
  assert.equal(result.dataHealth.finishedCalls, 3);
});

test("S4-E: legacy call lacking snapshot retains its original missing-diagnosis obligation", () => {
  const result = buildAssetReliability({
    machines: [{ id: "m37", name: "Máquina 37", isActive: true, createdAt: at("2026-11-10T12:00:00Z") }],
    calls: [makeCall("legacy", null, null, 1), makeCall("setup", "planned_setup", null, 0)],
    failureEvents: [], activeCalls: null, activeSessions: null,
    start: at("2026-11-11T09:00:00Z"), effectiveEnd: at("2026-11-11T11:00:00Z"),
  });
  assert.equal(result.dataHealth.finishedCallsMissingClassification, 1);
  assert.equal(result.assets[0].maintenanceReturnCycles, 1);
  assert.equal(result.assets[0].callsFinished, 2);
});
