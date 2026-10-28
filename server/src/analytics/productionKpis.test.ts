import assert from "node:assert/strict";
import test from "node:test";
import { buildPlannedProductionKpis, calculateObservedRestorationMttr } from "./productionKpis.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";

const D=(s:string)=>new Date(s);
const start=D("2026-10-12T10:00:00Z"),end=D("2026-10-12T18:00:00Z");
const asset=(machineId:string)=>({machineId,exposureStartedAt:D("2026-10-01T00:00:00Z")});
const production=(machineId:string,mode:string,a:string,b:string|null)=>({
  machineId,productionMode:mode,startedAt:D(a),endedAt:b?D(b):null,
});
const failure=(id:string,machineId:string,a:string,b:string|null,test=false):AnalyticsFailureEventRecord=>({
  id,machineId,machineName:machineId,startedAt:D(a),endedAt:b?D(b):null,
  failureResponsibility:"maintenance",linkedCallIsSystemTest:test,classification:null,callId:null,
});
const build=(data:Partial<Parameters<typeof buildPlannedProductionKpis>[0]>)=>
  buildPlannedProductionKpis({
    assets:[asset("M")],productionEvents:[],failureEvents:[],
    start,effectiveEnd:end,timeZone:"America/Sao_Paulo",...data,
  });

test("disponibilidade usa apenas período explicitamente programado, deduplicando paradas",()=>{
  const out=build({
    productionEvents:[
      production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T13:00:00Z"),
      production("M","not_scheduled","2026-10-12T13:00:00Z","2026-10-12T18:00:00Z"),
    ],
    failureEvents:[
      failure("f1","M","2026-10-12T12:00:00Z","2026-10-12T14:00:00Z"),
      failure("f2","M","2026-10-12T12:30:00Z","2026-10-12T13:30:00Z"),
    ],
  });
  assert.equal(out.availabilityPercent,66.67);
  assert.equal(out.scheduledMinutes,180);
  assert.equal(out.scheduledDowntimeMinutes,60);
  assert.equal(out.operatingMinutes,120);
  assert.equal(out.productionFailureEpisodes,1);
  assert.equal(out.plannedMtbfMinutes,120);
  assert.equal(out.resolvedMttrMinutes,120);
  assert.equal(out.resolvedEpisodes,1);
  assert.equal(out.coveredMachineCount,1);
});

test("máquina sem histórico íntegro não infla disponibilidade ou MTBF",()=>{
  const out=build({
    assets:[asset("M"),asset("N")],
    productionEvents:[
      production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z"),
      production("N","scheduled","2026-10-12T12:00:00Z","2026-10-12T18:00:00Z"),
    ],
    failureEvents:[failure("f1","N","2026-10-12T11:00:00Z","2026-10-12T12:00:00Z")],
  });
  assert.equal(out.populationCount,2);
  assert.equal(out.coveredMachineCount,1);
  assert.equal(out.uncoveredMachineCount,1);
  assert.equal(out.scheduledMinutes,480);
  assert.equal(out.availabilityPercent,100);
  assert.equal(out.plannedMtbfMinutes,null);
});

test("lacunas, sobreposições e modo desconhecido tornam janela inelegível",()=>{
  const variants=[
    [production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T12:00:00Z"),
     production("M","scheduled","2026-10-12T13:00:00Z","2026-10-12T18:00:00Z")],
    [production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T15:00:00Z"),
     production("M","not_scheduled","2026-10-12T14:00:00Z","2026-10-12T18:00:00Z")],
    [production("M","unknown","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")],
    [],
  ];
  for(const productionEvents of variants){
    const out=build({productionEvents});
    assert.equal(out.coveredMachineCount,0);
    assert.equal(out.uncoveredMachineCount,1);
    assert.equal(out.availabilityPercent,null);
  }
});

test("modo fora de produção evita falsa disponibilidade 100% com denominador zero",()=>{
  const out=build({productionEvents:[production("M","not_scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")]});
  assert.equal(out.scheduledMinutes,0);
  assert.equal(out.availabilityPercent,null);
  assert.equal(out.plannedMtbfMinutes,null);
  assert.equal(out.availabilityStatus,"no_programmed_minutes");
});

test("parada aberta reduz disponibilidade mas não gera MTTR de restabelecimento",()=>{
  const out=build({
    productionEvents:[production("M","scheduled","2026-10-12T09:00:00Z",null)],
    failureEvents:[failure("f1","M","2026-10-12T16:00:00Z",null)],
  });
  assert.equal(out.scheduledDowntimeMinutes,120);
  assert.equal(out.availabilityPercent,75);
  assert.equal(out.resolvedMttrMinutes,null);
  assert.equal(out.resolvedEpisodes,0);
});

test("paradas de testes marcados não contaminam disponibilidade",()=>{
  const out=build({
    productionEvents:[production("M","scheduled","2026-10-12T10:00:00Z",null)],
    failureEvents:[failure("test","M","2026-10-12T11:00:00Z","2026-10-12T12:00:00Z",true)],
  });
  assert.equal(out.availabilityPercent,100);
  assert.equal(out.productionFailureEpisodes,0);
  assert.equal(out.resolvedEpisodes,0);
});

test("MTTR físico une eventos e só inclui episódios efetivamente encerrados na janela",()=>{
  const o=calculateObservedRestorationMttr([
    failure("first","M","2026-10-12T08:00:00Z","2026-10-12T11:30:00Z"),
    failure("overlap","M","2026-10-12T11:00:00Z","2026-10-12T12:00:00Z"),
    failure("open","N","2026-10-12T12:00:00Z",null),
    failure("pre","P","2026-10-12T05:00:00Z","2026-10-12T09:59:00Z"),
  ],start,end);
  assert.equal(o.resolvedEpisodes,1);
  assert.equal(o.mttrMinutes,240);
});

test("segmentação de dias usa fuso do ANDON e horários parciais",()=>{
  const out=build({
    start:D("2026-10-13T02:30:00Z"),
    effectiveEnd:D("2026-10-13T03:30:00Z"),
    productionEvents:[production("M","scheduled","2026-10-13T02:30:00Z","2026-10-13T03:30:00Z")],
    failureEvents:[failure("f","M","2026-10-13T02:45:00Z","2026-10-13T03:15:00Z")],
  });
  assert.deepEqual(out.daily.map(d=>({date:d.date,p:d.scheduledMinutes,stop:d.scheduledDowntimeMinutes})),[
    {date:"2026-10-12",p:30,stop:15},
    {date:"2026-10-13",p:30,stop:15},
  ]);
});

test("filtros de setor/classificação não fabricam disponibilidade com denominador de outra população",()=>{
  const out=build({assets:null});
  assert.equal(out.availabilityPercent,null);
  assert.equal(out.availabilityStatus,"dimension_filtered");
});

test("BI2A: ausência de falha de manutenção é distinguida de falta de programação", () => {
  const missingSchedule=build({});
  assert.equal(missingSchedule.mtbfAvailabilityReason,"insufficient_schedule");
  assert.equal(missingSchedule.mttrAvailabilityReason,"no_closed_maintenance_episodes");
  const planned=build({
    productionEvents:[production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")],
  });
  assert.equal(planned.availabilityPercent,100);
  assert.equal(planned.plannedMtbfMinutes,null);
  assert.equal(planned.mtbfAvailabilityReason,"no_maintenance_failures");
  const unplanned=build({
    productionEvents:[production("M","not_scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")],
  });
  assert.equal(unplanned.mtbfAvailabilityReason,"no_programmed_minutes");
  assert.equal(unplanned.availabilityPercent,null);
  assert.equal(build({assets:null}).mtbfAvailabilityReason,"dimension_filtered");
});

test("BI2A: responsabilidade pendente não vira MTBF ou MTTR zero", () => {
  const pending={...failure("pending","M","2026-10-12T11:00:00Z","2026-10-12T12:00:00Z"),
    failureResponsibility:"unassigned"};
  const out=build({
    productionEvents:[production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")],
    failureEvents:[pending],
  });
  assert.equal(out.plannedMtbfMinutes,null);
  assert.equal(out.resolvedMttrMinutes,null);
  assert.equal(out.mtbfAvailabilityReason,"pending_attribution");
  assert.equal(out.mttrAvailabilityReason,"pending_attribution");
  assert.equal(out.closedPendingRestorationEpisodes,1);
  assert.equal(out.pendingAttributionEpisodes,1);
  assert.equal(out.allCauseRestorationMinutes,60);
  assert.equal(out.allCauseResolvedEpisodes,1);
});

test("BI2A: parada em manutenção ainda aberta explica MTTR indisponível", () => {
  const out=build({
    productionEvents:[production("M","scheduled","2026-10-12T10:00:00Z",null)],
    failureEvents:[failure("open","M","2026-10-12T16:00:00Z",null)],
  });
  assert.equal(out.mttrAvailabilityReason,"awaiting_restoration");
  assert.equal(out.openMaintenanceEpisodes,1);
  assert.equal(out.resolvedMttrMinutes,null);
  assert.equal(out.mtbfAvailabilityReason,"available");
  assert.equal(out.productionFailureEpisodes,1);
  assert.equal(out.plannedMtbfMinutes,360);
});

test("BI2A: indicadores disponíveis não têm seus valores alterados", () => {
  const out=build({
    productionEvents:[production("M","scheduled","2026-10-12T10:00:00Z","2026-10-12T18:00:00Z")],
    failureEvents:[failure("closed","M","2026-10-12T11:00:00Z","2026-10-12T12:00:00Z")],
  });
  assert.equal(out.mtbfAvailabilityReason,"available");
  assert.equal(out.mttrAvailabilityReason,"available");
  assert.equal(out.scheduledMinutes,480);
  assert.equal(out.scheduledDowntimeMinutes,60);
  assert.equal(out.plannedMtbfMinutes,420);
  assert.equal(out.resolvedMttrMinutes,60);
  assert.equal(out.resolvedEpisodes,1);
});
