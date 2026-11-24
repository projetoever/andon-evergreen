import assert from "node:assert/strict";
import test from "node:test";
import { buildBiSampleDiagnostics } from "./biSampleDiagnostics.js";

const at = (mins: number) => new Date(Date.parse("2026-11-24T12:00:00Z") + mins * 60_000);
const policy = {
  nature: "corrective_failure", maintenanceKpiPolicy: "eligible",
  analyticsDisposition: "include", reasonNameSnapshot: "Corretiva",
};
type Call = Parameters<typeof buildBiSampleDiagnostics>[0]["calls"][number];
const base: Omit<Call, "id"> = {
  machineId: "37",
  subtype: "mechanical",
  status: "finished",
  openedAt: at(1),
  attendedAt: at(3),
  finishedAt: at(40),
  failureClassification: "broken_motor",
  failureResponsibility: "maintenance",
  callReasonSnapshot: policy,
};
const production = {
  productionFailureEpisodes: 1,
  pendingAttributionEpisodes: 1,
  resolvedEpisodes: 1,
  closedPendingRestorationEpisodes: 2,
  coveredMachineCount: 1,
  populationCount: 1,
};
const build = (calls: Call[], failureEvents: Array<{
  machineId: string; callId: string | null; startedAt: Date;
  endedAt: Date | null; failureResponsibility: string | null;
}> = []) => buildBiSampleDiagnostics({
  calls, failureEvents, production, start: at(0), effectiveEnd: at(120),
  assets: [{ machineId: "37", exposureStartedAt: at(-30) }],
  productionEvents: [{ machineId: "37", productionMode: "scheduled", startedAt: at(0), endedAt: at(120) }],
});

test("PENTE5C: atendimento sem finalizar é visível mas não vira retorno nem MTTR", () => {
  const result = build([{...base,id:"not-finished",status:"in_progress",finishedAt:null}]);
  assert.equal(result.counters.attendedInPeriod,1);
  assert.equal(result.counters.finishedInPeriod,0);
  assert.equal(result.counters.correctiveFinishedMaintenance,0);
  assert.equal(result.cases[0].gate,"awaiting_finalization");
});

test("PENTE5C: grupo aparece no BI mas política pendente impede corretivo", () => {
  const result=build([{...base,id:"pending-policy",
    callReasonSnapshot:{...policy,maintenanceKpiPolicy:"pending"}}]);
  assert.equal(result.counters.finishedInPeriod,1);
  assert.equal(result.counters.nonCorrectiveFinished,1);
  assert.equal(result.counters.correctiveFinishedMaintenance,0);
  assert.equal(result.cases[0].gate,"non_corrective_group");
  assert.equal(result.cases[0].groupMaintenanceKpiPolicy,"pending");
});

test("PENTE5C: finalizado e corretivo sem domínio confirmado não é amostra de manutenção", () => {
  const result=build([{...base,id:"unknown-domain",failureResponsibility:null}]);
  assert.equal(result.counters.correctiveFinished,1);
  assert.equal(result.counters.correctiveFinishedPendingResponsibility,1);
  assert.equal(result.cases[0].gate,"unassigned_diagnosis");
});

test("PENTE5C: 1 manutenção finalizada com ou sem parada não se transforma em MTTR inventado", () => {
  const call={...base,id:"repair-real"};
  const noPhysical=build([call]);
  assert.equal(noPhysical.counters.correctiveFinishedMaintenance,1);
  assert.equal(noPhysical.cases[0].gate,"no_linked_physical_stop");
  const withPhysical=build([call],[{
    machineId:"37",callId:"repair-real",startedAt:at(2),
    endedAt:at(25),failureResponsibility:"maintenance",
  }]);
  assert.equal(withPhysical.counters.correctiveFinishedMaintenance,1);
  assert.equal(withPhysical.cases[0].closedLinkedPhysicalStops,1);
  assert.equal(withPhysical.cases[0].gate,"candidate_needs_causal_episode");
  assert.equal(withPhysical.cases[0].scheduleCoverage,"verified_schedule");
});

test("PENTE5C: não expõe diagnóstico de outra máquina nem trata acabado fora da janela como amostra",()=>{
  const late={...base,id:"late",finishedAt:at(150)};
  const result=build([late],[{
    machineId:"99",callId:"late",startedAt:at(1),
    endedAt:at(22),failureResponsibility:"maintenance",
  }]);
  assert.equal(result.counters.finishedInPeriod,0);
  assert.equal(result.cases[0].gate,"finished_outside_period");
  assert.equal(result.cases[0].hasPhysicalLinkedStop,false);
});

test("PENTE5C: falha elegível em máquina com lacuna de programação sinaliza cobertura incompleta", () => {
  const result = buildBiSampleDiagnostics({
    calls: [{...base,id:"schedule-gap"}],
    failureEvents: [{
      machineId:"37",callId:"schedule-gap",startedAt:at(12),
      endedAt:at(25),failureResponsibility:"maintenance",
    }],
    production, start:at(0),effectiveEnd:at(120),
    assets:[{machineId:"37",exposureStartedAt:at(-20)}],
    productionEvents:[{machineId:"37",productionMode:"scheduled",startedAt:at(10),endedAt:at(120)}],
  });
  assert.equal(result.cases[0].gate,"candidate_needs_causal_episode");
  assert.equal(result.cases[0].scheduleCoverage,"incomplete");
});
