import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutiveOverview, type AnalyticsCallRecord } from "./overview.js";

const date = (time: string) => new Date(time);
const reason = (nature: string, maintenanceKpiPolicy = "eligible") => ({
  nature, maintenanceKpiPolicy, analyticsDisposition: "include",
});
const sample = (id: string, snapshot?: AnalyticsCallRecord["callReasonSnapshot"]): AnalyticsCallRecord => ({
  id, machineId: "37", subtype: "mechanical", status: "finished",
  openedAt: date("2026-11-11T10:00:00Z"),
  attendedAt: date(id === "setup" ? "2026-11-11T10:40:00Z" : "2026-11-11T10:10:00Z"),
  maintenanceCompletedAt: date("2026-11-11T11:00:00Z"),
  finishedAt: date("2026-11-11T11:30:00Z"),
  attendanceMinutes: id === "setup" ? 90 : 30,
  postMaintenanceMinutes: 10,
  maintenanceReturnCount: 1,
  failureClassification: "mechanical_failure",
  failureResponsibility: "maintenance",
  analyticsDisposition: "include",
  isSystemTest: false,
  callReasonSnapshot: snapshot,
});

test("S4-B: Setup/Mecânica affects operational time but not corrective response MTTA/return rate", () => {
  const result = buildExecutiveOverview({
    calls: [sample("corrective", reason("corrective_failure")), sample("setup", reason("planned_setup", "excluded"))],
    failureEvents: [{
      id: "physical_setup_stop", machineId: "37", machineName: "Máquina 37",
      startedAt: date("2026-11-11T10:00:00Z"), endedAt: date("2026-11-11T10:15:00Z"),
      classification: "mechanical_failure", failureResponsibility: "operations",
      callId: "setup", linkedCallIsSystemTest: false,
    }],
    activeCallsNow: 0, reliabilityAssets: null,
    start: date("2026-11-11T09:00:00Z"), end: date("2026-11-11T12:00:00Z"),
    effectiveEnd: date("2026-11-11T12:00:00Z"), generatedAt: date("2026-11-11T12:00:00Z"),
    timeZone: "America/Sao_Paulo", filters: {},
  });
  assert.equal(result.kpis.callsFinished, 2);
  assert.equal(result.kpis.mttaMinutes, 10);
  assert.equal(result.kpis.maintenanceEligibleFinishedCalls, 1);
  assert.equal(result.kpis.maintenanceReturnCycles, 1);
  assert.equal(result.kpis.avgMaintenanceMinutes, 60);
  assert.equal(result.kpis.downtimeMinutes, 15);
  assert.equal(result.kpis.physicalStopEpisodes, 1);
  assert.equal(result.kpis.mttrMinutes, null);
});

test("S4-B: legacy without hierarchy snapshot remains in prior MTTA calculation", () => {
  const result = buildExecutiveOverview({
    calls: [sample("legacy", null)], failureEvents: [], activeCallsNow: 0,
    reliabilityAssets: null, start: date("2026-11-11T09:00:00Z"),
    end: date("2026-11-11T12:00:00Z"), effectiveEnd: date("2026-11-11T12:00:00Z"),
    generatedAt: date("2026-11-11T12:00:00Z"), timeZone: "America/Sao_Paulo",
    filters: {},
  });
  assert.equal(result.kpis.mttaMinutes, 10);
  assert.equal(result.kpis.maintenanceEligibleFinishedCalls, 1);
});
