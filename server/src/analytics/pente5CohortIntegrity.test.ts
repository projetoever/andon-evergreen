import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCausalEpisodes, buildCorrectiveCausalEpisodes, NON_CORRECTIVE_ORIGIN } from "./causality.js";
import { buildPlannedProductionKpis } from "./productionKpis.js";
import { buildExecutiveOverview, type AnalyticsCallRecord, type AnalyticsFailureEventRecord } from "./overview.js";
import { buildBiCausalCohortAudit } from "./biCausalCohortAudit.js";

const at = (minutes: number) => new Date(Date.parse("2026-11-24T10:00:00Z") + minutes * 60_000);
const physical = (
  id: string, from: number, to: number | null, correctiveReasonCandidate: boolean | undefined,
  responsibility = "maintenance",
): AnalyticsFailureEventRecord => ({
  id, machineId: "37", machineName: "Máquina 37", startedAt: at(from),
  endedAt: to === null ? null : at(to), classification: "mechanical",
  failureResponsibility: responsibility, analyticsDisposition: "include",
  callId: id + "_call", linkedCallIsSystemTest: false, correctiveReasonCandidate,
});
const setup = physical("setup", 10, 30, false);
const repair = physical("corrective", 60, 80, true);
const schedule = [
  {machineId: "37", productionMode: "scheduled", startedAt: at(0), endedAt: at(120)},
];
function measured(events: AnalyticsFailureEventRecord[]) {
  return buildPlannedProductionKpis({
    assets: [{machineId: "37", exposureStartedAt: at(-300)}],
    productionEvents: schedule, failureEvents: events,
    causalEpisodes: buildCorrectiveCausalEpisodes(events),
    start: at(0), effectiveEnd: at(120), timeZone: "America/Sao_Paulo",
  });
}

test("PENTE5: API overview routes scheduled KPIs to corrective episodes", () => {
  const source = readFileSync(new URL("../routes/analytics.ts", import.meta.url), "utf8");
  assert.match(source, /causalEpisodes: currentData\.correctiveCausalEpisodes/);
  assert.doesNotMatch(source, /causalEpisodes: currentData\.causalEpisodes,\s*start: period\.start/);
});

test("PENTE5: Setup real + reparo correctivo => perda física integral, uma falha corretiva", () => {
  assert.deepEqual(buildCausalEpisodes([setup, repair]).map(e => e.responsibility),
    ["maintenance", "maintenance"]);
  assert.deepEqual(buildCorrectiveCausalEpisodes([setup, repair]).map(e => e.responsibility),
    [NON_CORRECTIVE_ORIGIN, "maintenance"]);
  const result = measured([setup, repair]);
  assert.equal(result.scheduledMinutes, 120);
  assert.equal(result.scheduledDowntimeMinutes, 40);
  assert.equal(result.availabilityPercent, 66.67);
  assert.equal(result.productionFailureEpisodes, 1);
  assert.equal(result.pendingAttributionEpisodes, 0);
  assert.equal(result.plannedMtbfMinutes, 80);
  assert.equal(result.resolvedMttrMinutes, 20);
  assert.equal(result.resolvedEpisodes, 1);
  assert.equal(result.allCauseResolvedEpisodes, 2);
});

test("PENTE5: Setup isolado reduz disponibilidade, mas não é falha ou causa pendente", () => {
  const result = measured([setup]);
  assert.equal(result.scheduledDowntimeMinutes, 20);
  assert.equal(result.availabilityPercent, 83.33);
  assert.equal(result.productionFailureEpisodes, 0);
  assert.equal(result.pendingAttributionEpisodes, 0);
  assert.equal(result.closedPendingRestorationEpisodes, 0);
  assert.equal(result.plannedMtbfMinutes, null);
  assert.equal(result.mtbfAvailabilityReason, "no_maintenance_failures");
  assert.equal(result.resolvedMttrMinutes, null);
  assert.equal(result.mttrAvailabilityReason, "no_closed_maintenance_episodes");
});

test("PENTE5: uma falha confirmada gera MTBF provisório com outra pendente", () => {
  const pending = physical("pending", 35, 55, true, "unassigned");
  const result = measured([setup, repair, pending]);
  assert.equal(result.scheduledDowntimeMinutes, 60);
  assert.equal(result.pendingAttributionEpisodes, 1);
  assert.equal(result.mtbfAvailabilityReason, "partial_pending_attribution");
  assert.equal(result.mtbfSampleStatus, "partial");
  assert.equal(result.productionFailureEpisodes, 1);
  assert.equal(result.plannedMtbfMinutes, 60);
  assert.equal(result.resolvedMttrMinutes, 20);
});

test("PENTE5: episódio misto sobreposto não é contado duas vezes nem inventa correção completa", () => {
  const overlap = physical("repair_overlap", 25, 50, true);
  const result = measured([setup, overlap]);
  assert.equal(result.scheduledDowntimeMinutes, 40);
  assert.equal(result.availabilityPercent, 66.67);
  assert.equal(result.productionFailureEpisodes, 0);
  assert.equal(result.pendingAttributionEpisodes, 1);
  assert.equal(result.mtbfAvailabilityReason, "pending_attribution");
  assert.equal(result.mtbfSampleStatus, "none");
  assert.equal(result.plannedMtbfMinutes, null);
  assert.equal(result.resolvedMttrMinutes, null);
});

test("PENTE5: auditoria concorda com KPI programado sobre exclusão de Setup", () => {
  const audit = buildBiCausalCohortAudit({
    machineId: "37", asset: {machineId: "37", exposureStartedAt: at(-300)},
    events: [setup, repair], impacts: [], productionEvents: schedule,
    start: at(0), effectiveEnd: at(120), timeZone: "America/Sao_Paulo",
  });
  assert.equal(audit.official.resolvedMttrMinutes, 20);
  assert.equal(audit.official.plannedMtbfMinutes, 80);
  assert.equal(audit.official.pendingScheduledEpisodes, 0);
  assert.equal(audit.mttrReasons.non_corrective_origin, 1);
  assert.equal(audit.mtbfReasons.non_corrective_origin, 1);
  assert.equal(audit.mttrReasons.included, 1);
  assert.equal(audit.production.scheduledDowntimeMinutes, 40);
});

const correctivePolicy = {
  nature: "corrective_failure", maintenanceKpiPolicy: "eligible", analyticsDisposition: "include",
};
const setupPolicy = {
  nature: "planned_setup", maintenanceKpiPolicy: "excluded", analyticsDisposition: "include",
};
function finishedCall(id: string, snapshot: typeof correctivePolicy, returns: number): AnalyticsCallRecord {
  return {
    id, machineId: "37", subtype: "mechanical", status: "finished",
    openedAt: at(5), attendedAt: at(10), maintenanceCompletedAt: at(30),
    finishedAt: at(40), attendanceMinutes: 20, postMaintenanceMinutes: 10,
    maintenanceReturnCount: returns, failureClassification: "mechanical",
    failureResponsibility: "maintenance", analyticsDisposition: "include",
    callReasonSnapshot: snapshot, isSystemTest: false,
  };
}
function overview(calls: AnalyticsCallRecord[]) {
  return buildExecutiveOverview({
    calls, failureEvents: [], activeCallsNow: 0, reliabilityAssets: null,
    start: at(0), end: at(120), effectiveEnd: at(120), generatedAt: at(120),
    timeZone: "America/Sao_Paulo", filters: {},
  });
}
test("PENTE5: zero retorno é 0% com denominador; sem denominador é Sem amostra", () => {
  const one = overview([finishedCall("repair", correctivePolicy, 0),
    finishedCall("setup", setupPolicy, 7)]);
  assert.equal(one.kpis.maintenanceEligibleFinishedCalls, 1);
  assert.equal(one.kpis.returnedCalls, 0);
  assert.equal(one.kpis.maintenanceReturnRatePercent, 0);
  assert.equal(one.kpis.correctiveFinishedCandidates, 1);
  assert.equal(one.kpis.pendingCorrectiveFinishedCalls, 0);
  const two = overview([finishedCall("repair", correctivePolicy, 2)]);
  assert.equal(two.kpis.returnedCalls, 1, "dois ciclos não são dois chamados");
  assert.equal(two.kpis.maintenanceReturnCycles, 2);
  assert.equal(two.kpis.maintenanceReturnRatePercent, 100);
  const pending = overview([{ ...finishedCall("pending", correctivePolicy, 0), failureResponsibility: null }]);
  assert.equal(pending.kpis.pendingCorrectiveFinishedCalls, 1);
  assert.equal(pending.kpis.maintenanceReturnRatePercent, null);
  const noSample = overview([finishedCall("setup", setupPolicy, 0)]);
  assert.equal(noSample.kpis.maintenanceEligibleFinishedCalls, 0);
  assert.equal(noSample.kpis.maintenanceReturnRatePercent, null);
});
