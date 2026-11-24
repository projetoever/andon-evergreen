import assert from "node:assert/strict";
import test from "node:test";
import { buildBiCausalCohortAudit } from "./biCausalCohortAudit.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";
const D = (s: string) => new Date(s);
const t = (m: number) => new Date(D("2026-10-12T10:00:00Z").getTime() + m * 60_000);
const event = (id: string, a: number, b: number | null, responsibility = "maintenance"): AnalyticsFailureEventRecord => ({
  id, machineId: "37", machineName: "Máquina 37", startedAt: t(a), endedAt: b === null ? null : t(b),
  classification: "mechanical", failureResponsibility: responsibility,
  analyticsDisposition: "include", callId: null, linkedCallIsSystemTest: false,
});
const input = (events: AnalyticsFailureEventRecord[]) => ({
  machineId: "37",
  asset: { machineId: "37", exposureStartedAt: t(-200) },
  events,
  impacts: [],
  productionEvents: [{machineId:"37",productionMode:"scheduled",startedAt:t(0),endedAt:t(120)}],
  start:t(0),effectiveEnd:t(120),timeZone:"America/Sao_Paulo",
});
test("phase 2B: reconcilia episódios físicos, causa pendente e parada aberta sem alterar KPIs", () => {
  const events = [
    event("m_real_000001",0,30),
    event("p_pending_000002",40,60,"unassigned"),
    event("m_open_000003",70,null),
    {...event("excluded_000004",5,15),analyticsDisposition:"test"},
    {...event("elsewhere_000005",10,20),machineId:"38"},
  ];
  const result = buildBiCausalCohortAudit(input(events));
  assert.equal(result.episodeCount,3);
  assert.equal(result.official.resolvedMttrMinutes,30);
  assert.equal(result.official.mttrEligibleRestorations,1);
  assert.equal(result.official.plannedMtbfMinutes,10);
  assert.equal(result.official.mtbfSampleStatus,"partial");
  assert.equal(result.official.pendingScheduledEpisodes,1);
  assert.equal(result.production.scheduledMinutes,120);
  assert.equal(result.production.scheduledDowntimeMinutes,100);
  assert.equal(result.mttrReasons.included,1);
  assert.equal(result.mttrReasons.pending_or_mixed,1);
  assert.equal(result.mttrReasons.still_open,1);
  assert.equal(result.mtbfReasons.included,2);
  assert.equal(result.mtbfReasons.blocked_by_pending_cause ?? 0,0);
  assert.equal(result.mtbfReasons.pending_or_mixed,1);
  assert(!JSON.stringify(result).includes("excluded_000004"));
  assert(!JSON.stringify(result).includes("elsewhere_000005"));
});
test("phase 2B: um episódio duplicado ou sobreposto não vira duas restaurações", () => {
  const result=buildBiCausalCohortAudit(input([
    event("one_00000001",0,20),event("two_00000002",10,30),
  ]));
  assert.equal(result.episodeCount,1);
  assert.equal(result.official.resolvedMttrMinutes,30);
  assert.equal(result.official.mttrEligibleRestorations,1);
  assert.equal(result.official.mtbfEligibleFailures,1);
  assert.equal(result.official.plannedMtbfMinutes,90);
  assert.equal(result.episodes[0].eventIdSuffixes.length,2);
});
test("phase 2B: carry-in pode restaurar na janela sem novo início de falha no MTBF", () => {
  const result=buildBiCausalCohortAudit(input([event("carry_00000001",-30,30)]));
  assert.equal(result.episodeCount,1);
  assert.equal(result.episodes[0].mttrReason,"included");
  assert.equal(result.episodes[0].mtbfReason,"started_before_window");
  assert.equal(result.official.resolvedMttrMinutes,60);
  assert.equal(result.official.plannedMtbfMinutes,null);
});
test("phase 2B: insuficiência de programação não cria exposição nem MTBF", () => {
  const value=input([event("m1",0,30)]);
  value.productionEvents = [
    {machineId:"37",productionMode:"scheduled",startedAt:t(10),endedAt:t(120)},
  ];
  const result=buildBiCausalCohortAudit(value);
  assert.equal(result.official.mtbfAvailabilityReason,"insufficient_schedule");
  assert.equal(result.episodes[0].mtbfReason,"missing_schedule");
  assert.equal(result.official.plannedMtbfMinutes,null);
  assert.equal(result.official.resolvedMttrMinutes,30);
});
test("phase 2B: não confunde janela, máquina ou encerramento futuro", () => {
  const value=input([event("past_00000001",-60,-10),event("future_0000002",70,150)]);
  const result=buildBiCausalCohortAudit(value);
  assert.equal(result.episodeCount,1);
  assert.equal(result.episodes[0].mttrReason,"out_of_period");
  assert.equal(result.official.resolvedMttrMinutes,null);
  assert.throws(()=>buildBiCausalCohortAudit({...value,asset:{machineId:"38",exposureStartedAt:t(0)}}));
  assert.throws(()=>buildBiCausalCohortAudit({...value,effectiveEnd:t(0)}));
});

test("RC06: Setup/Teste e eventos cancelados nao contaminam parada ou coorte corretiva", () => {
  const events = [
    event("corrective_0001", 0, 20),
    {...event("setup_0000002", 10, 70), analyticsDisposition: "test"},
    {...event("system_000003", 30, 60), linkedCallIsSystemTest: true},
    {...event("cancel_000004", 80, 90), status: "cancelled"},
    {...event("foreign_000005", 0, 120), machineId: "38"},
  ];
  const result = buildBiCausalCohortAudit(input(events));
  assert.equal(result.episodeCount, 1, "only the eligible corrective event counts");
  assert.equal(result.official.resolvedMttrMinutes, 20);
  assert.equal(result.official.mttrEligibleRestorations, 1);
  assert.equal(result.episodes[0].responsibility, "maintenance");
  assert.equal(result.episodes[0].mttrReason, "included");
  assert.equal(result.production.scheduledDowntimeMinutes, 20);
  const output = JSON.stringify(result);
  for (const excluded of ["setup_0000002","system_000003","cancel_000004","foreign_000005"])
    assert.equal(output.includes(excluded), false, excluded + " must never be a KPI incident");
});
