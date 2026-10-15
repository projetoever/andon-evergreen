import assert from "node:assert/strict";
import test from "node:test";
import { buildCausalEpisodes, summarizeCausalDowntime } from "./causality.js";
import { analyticsEligibility, diagnosisSnapshot } from "./eligibility.js";
import {
  buildExecutiveOverview,
  type AnalyticsFailureEventRecord,
  type AnalyticsCallRecord,
} from "./overview.js";
import { buildPlannedProductionKpis } from "./productionKpis.js";
import {
  buildMaintenanceParticipation,
  type AnalyticsMaintenanceSessionRecord,
} from "./maintenance.js";
import { buildFailureIntelligence } from "./failureIntelligence.js";
import { calculateEstimatedMtbf } from "./overview.js";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 10, 10, minutes));
const event = (
  id: string,
  a: number,
  b: number | null,
  domain: string | null = "maintenance",
): AnalyticsFailureEventRecord => ({
  id,
  machineId: "M",
  machineName: "M",
  startedAt: at(a),
  endedAt: b === null ? null : at(b),
  classification: "diagnosis",
  callId: id,
  linkedCallIsSystemTest: false,
  failureResponsibility: domain,
  analyticsDisposition: "include",
});
const call = (id: string, domain = "maintenance"): AnalyticsCallRecord => ({
  id,
  machineId: "M",
  subtype: "electrical",
  status: "finished",
  openedAt: at(0),
  attendedAt: at(10),
  maintenanceCompletedAt: at(20),
  finishedAt: at(30),
  attendanceMinutes: 10,
  postMaintenanceMinutes: 10,
  failureClassification: "diagnosis",
  maintenanceReturnCount: 1,
  isSystemTest: false,
  failureResponsibility: domain,
  analyticsDisposition: "include",
});
const overview = (calls: AnalyticsCallRecord[], failureEvents: AnalyticsFailureEventRecord[]) =>
  buildExecutiveOverview({
    calls,
    failureEvents,
    activeCallsNow: 0,
    reliabilityAssets: null,
    start: at(0),
    end: at(120),
    effectiveEnd: at(120),
    generatedAt: at(120),
    timeZone: "America/Sao_Paulo",
    filters: {},
  });
const production = (
  events: AnalyticsFailureEventRecord[],
  causalEpisodes = buildCausalEpisodes(events),
) =>
  buildPlannedProductionKpis({
    assets: [{ machineId: "M", exposureStartedAt: at(-100) }],
    productionEvents: [
      { machineId: "M", productionMode: "scheduled", startedAt: at(0), endedAt: at(120) },
    ],
    failureEvents: events,
    causalEpisodes,
    start: at(0),
    effectiveEnd: at(120),
    timeZone: "America/Sao_Paulo",
  });
const session = (
  id: string,
  technicianId: string,
  a: number,
  b: number,
  phase = "maintenance",
  failureResponsibility = "process",
): AnalyticsMaintenanceSessionRecord => ({
  id,
  technicianId,
  technicianName: technicianId,
  technicalArea: "electrical",
  machineId: "M",
  callId: id,
  startedAt: at(a),
  endedAt: at(b),
  cycleIndex: 1,
  phase,
  failureResponsibility,
});

test("diagnóstico de processo mantém parada global e trabalho do mantenedor, fora dos KPIs de manutenção", () => {
  const events = [event("process", 0, 30, "process")];
  const out = production(events);
  assert.equal(out.availabilityPercent, 75);
  assert.equal(out.resolvedMttrMinutes, null);
  assert.equal(out.resolvedEpisodes, 0);
  assert.equal(out.productionFailureEpisodes, 0);
  assert.equal(out.plannedMtbfMinutes, null);
  assert.equal(out.allCauseRestorationMinutes, 30);
  const participation = buildMaintenanceParticipation({
    sessions: [session("support", "A", 10, 20)],
    start: at(0),
    effectiveEnd: at(120),
  });
  assert.equal(participation.totals.maintenancePersonMinutes, 10);
  assert.deepEqual(participation.responsibility, [
    { responsibility: "process", personMinutes: 10 },
  ]);
  assert.equal(
    overview([call("process", "process")], events).kpis.maintenanceReturnRatePercent,
    null,
  );
});

test("MTBF pondera exposição real e falhas de manutenção; MTTR remove não manutenção do numerador e denominador", () => {
  const events = [event("maintenance", 0, 30), event("quality", 40, 100, "quality")];
  const out = production(events);
  assert.equal(out.scheduledDowntimeMinutes, 90);
  assert.equal(out.operatingMinutes, 30);
  assert.equal(out.productionFailureEpisodes, 1);
  assert.equal(out.plannedMtbfMinutes, 30);
  assert.equal(out.resolvedMttrMinutes, 30);
  assert.equal(out.resolvedEpisodes, 1);
  const result = overview([call("M"), call("Q", "quality")], events);
  assert.equal(result.kpis.maintenanceEligibleFinishedCalls, 1);
  assert.equal(result.kpis.maintenanceReturnRatePercent, 100);
  assert.equal(result.kpis.mttrMinutes, 30);
});

test("handoff causal conserva minutos físicos sem atribuir todo o episódio ao último chamado", () => {
  const events = [event("last-owner", 0, 60, "quality")];
  const impacts = [
    {
      id: "a",
      machineId: "M",
      startedAt: at(0),
      endedAt: at(20),
      failureResponsibility: "maintenance",
    },
    {
      id: "b",
      machineId: "M",
      startedAt: at(20),
      endedAt: at(60),
      failureResponsibility: "process",
    },
  ];
  const episodes = buildCausalEpisodes(events, impacts);
  const summary = summarizeCausalDowntime(episodes, at(0), at(120));
  assert.equal(summary.find((row) => row.responsibility === "maintenance")?.downtimeMinutes, 20);
  assert.equal(summary.find((row) => row.responsibility === "process")?.downtimeMinutes, 40);
  assert.equal(
    summary.reduce((sum, row) => sum + row.downtimeMinutes, 0),
    60,
  );
  assert.equal(episodes[0].responsibility, "mixed");
  const out = production(events, episodes);
  assert.equal(out.pendingAttributionEpisodes, 1);
  assert.equal(out.plannedMtbfMinutes, null);
  assert.equal(out.resolvedEpisodes, 0);
});

test("causas conflitantes e legado sem snapshot ficam pendentes, sem melhorar artificialmente disponibilidade", () => {
  const events = [event("unknown", 0, 30, null), event("M", 50, 80)];
  const out = production(events);
  assert.equal(out.availabilityPercent, 50);
  assert.equal(out.pendingAttributionEpisodes, 1);
  assert.equal(out.plannedMtbfMinutes, null);
  assert.equal(out.resolvedMttrMinutes, 30);
  const conflicting = buildCausalEpisodes([event("one", 0, 30), event("two", 10, 20, "process")]);
  assert.equal(
    summarizeCausalDowntime(conflicting, at(0), at(120)).find(
      (row) => row.responsibility === "unassigned",
    )?.downtimeMinutes,
    10,
  );
});

test("teste, falso chamado, duplicado e cancelado não viram amostra zero; IDs repetidos não duplicam denominadores", () => {
  const real = call("real");
  const calls = [
    real,
    real,
    ...["test", "false_call", "duplicate"].map((disposition) => ({
      ...call(disposition),
      analyticsDisposition: disposition,
    })),
    { ...call("manual-test"), failureClassification: "teste" },
    { ...call("cancelled"), status: "cancelled" },
  ];
  const events = [
    event("real", 0, 30),
    event("real", 0, 30),
    { ...event("test", 40, 110), analyticsDisposition: "test" },
    { ...event("false", 40, 110), analyticsDisposition: "false_call" },
    { ...event("duplicate", 40, 110), analyticsDisposition: "duplicate" },
  ];
  const out = overview(calls, events);
  assert.equal(out.kpis.callsOpened, 1);
  assert.equal(out.kpis.callsFinished, 1);
  assert.equal(out.kpis.downtimeMinutes, 30);
  assert.equal(out.kpis.failureOccurrences, 1);
  assert.equal(out.coverage.mttrSampleSize, 1);
  assert.equal(out.kpis.mttrMinutes, 30);
});

test("episódio anterior à janela reduz disponibilidade e mantém MTTR integral ao encerrar, sem novo início no MTBF", () => {
  const out = production([event("carry-in", -20, 30)]);
  assert.equal(out.scheduledDowntimeMinutes, 30);
  assert.equal(out.productionFailureEpisodes, 0);
  assert.equal(out.plannedMtbfMinutes, null);
  assert.equal(out.resolvedMttrMinutes, 50);
  assert.equal(production([event("open", 0, null)]).resolvedMttrMinutes, null);
});

test("sobreposição do mesmo técnico é união temporal; pessoas diferentes continuam somando trabalho real", () => {
  const a = session("a", "A", 0, 40),
    b = session("b", "A", 20, 60),
    c = session("c", "B", 0, 60);
  const out = buildMaintenanceParticipation({
    sessions: [a, a, b, c],
    start: at(0),
    effectiveEnd: at(120),
  });
  assert.equal(out.totals.totalPersonMinutes, 120);
  assert.equal(out.totals.overlapMinutesRemoved, 20);
  assert.equal(out.technicians.find((row) => row.technicianId === "A")?.totalPersonMinutes, 60);
  assert.equal(out.coverage.totalSessions, 3);
  const conflict = buildMaintenanceParticipation({
    sessions: [a, session("follow", "A", 20, 60, "follow_up")],
    start: at(0),
    effectiveEnd: at(120),
  });
  assert.equal(conflict.coverage.legacyMinutes, 20);
  assert.equal(conflict.totals.totalPersonMinutes + conflict.coverage.legacyMinutes, 60);
});

test("catálogo não inventa responsabilidade legada; snapshots permanecem estáveis quando o catálogo muda", () => {
  const catalog = {
    value: "diagnosis",
    responsibility: "process",
    analyticsDisposition: "include",
  };
  const old = diagnosisSnapshot(catalog);
  catalog.responsibility = "maintenance";
  assert.equal(old.failureResponsibility, "process");
  assert.equal(diagnosisSnapshot(null).failureResponsibility, null);
  assert.equal(diagnosisSnapshot({ ...catalog, value: "teste" }).analyticsDisposition, "test");
  const policy = analyticsEligibility([{ value: "validation", analyticsDisposition: "test" }]);
  assert.match(JSON.stringify(policy.callWhere), /validation/);
});

test("amostras futuras e sequências temporais inválidas não geram MTTA zero", () => {
  const invalid = { ...call("bad"), attendedAt: at(-10) };
  const out = overview(
    [invalid, { ...call("future"), openedAt: at(121), attendedAt: at(122), finishedAt: at(125) }],
    [],
  );
  assert.equal(out.kpis.mttaMinutes, null);
  assert.equal(out.coverage.mttaSampleSize, 0);
  assert.equal(out.kpis.callsOpened, 1);
});

test("reincidência ignora duplicação de ID e chamados simultâneos", () => {
  const base = {
    machineId: "M",
    machineName: "M",
    subtype: "electrical",
    classification: "sensor",
    description: null,
    workOrderNumber: null,
    maintenanceReturnCount: 0,
    isSystemTest: false,
    confirmedMachineSetId: null,
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSubsetId: null,
    confirmedMachineSubsetNameSnapshot: null,
    machineSetId: null,
    machineSetNameSnapshot: null,
    machineSubsetId: null,
    machineSubsetNameSnapshot: null,
  };
  const first = { ...base, id: "one", openedAt: at(0), finishedAt: at(30) };
  const concurrent = { ...base, id: "two", openedAt: at(10), finishedAt: at(40) };
  const repeat = { ...base, id: "three", openedAt: at(50), finishedAt: at(80) };
  const result = buildFailureIntelligence({
    calls: [first, first, concurrent, repeat],
    start: at(0),
    effectiveEnd: at(120),
    filters: {},
  });
  assert.equal(result.totals.diagnosedFinishedCalls, 3);
  assert.equal(result.totals.repeated24h, 1);
});

test("exposição por calendário não subtrai perdas de máquinas fora da população nem tempo anterior ao cadastro", () => {
  const result = calculateEstimatedMtbf(
    [event("early", 0, 30), { ...event("outside", 0, 120), machineId: "outside" }],
    [
      { machineId: "M", exposureStartedAt: at(20) },
      { machineId: "M", exposureStartedAt: at(20) },
    ],
    at(0),
    at(120),
  );
  assert.equal(result.calendarExposureMinutes, 100);
  assert.equal(result.operatingExposureMinutes, 90);
  assert.equal(result.mtbfEstimatedMinutes, 90);
  assert.equal(result.monitoredMachineCount, 1);
});
