import assert from "node:assert/strict";
import test from "node:test";
import { calculateScheduledPerformance } from "./scheduledPerformance.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";

const t = (iso: string) => new Date(iso);
const start = t("2026-10-13T09:00:00Z");
const end = t("2026-10-14T09:00:00Z");
const machines = [{ machineId:"m1", createdAt:t("2026-10-01T00:00:00Z") }];
const mode = (machineId:string, productionMode:string, a:string,b:string|null)=>({
  machineId, productionMode, startedAt:t(a), endedAt:b?t(b):null,
});
const stop = (machineId:string,a:string,b:string|null):AnalyticsFailureEventRecord=>({
  id:machineId+a,machineId,machineName:machineId, startedAt:t(a),endedAt:b?t(b):null,
  classification:null,callId:null,linkedCallIsSystemTest:false,
});
const run=(events:ReturnType<typeof mode>[],failures:AnalyticsFailureEventRecord[]=[],ms=machines)=>{
  return calculateScheduledPerformance({machines:ms,events,failures,start,effectiveEnd:end,timeZone:"America/Sao_Paulo"});
};

test("disponibilidade usa somente horas programadas e desconta paradas sobrepostas",()=>{
  const r=run([
    mode("m1","not_scheduled","2026-10-12T00:00:00Z","2026-10-13T12:00:00Z"),
    mode("m1","scheduled","2026-10-13T12:00:00Z","2026-10-13T20:00:00Z"),
    mode("m1","not_scheduled","2026-10-13T20:00:00Z",null),
  ],[
    stop("m1","2026-10-13T10:00:00Z","2026-10-13T14:00:00Z"), // 2h scheduled
    stop("m1","2026-10-13T13:00:00Z","2026-10-13T15:00:00Z"), // overlap
    stop("m1","2026-10-14T02:00:00Z","2026-10-14T05:00:00Z"), // outside production
  ]);
  assert.equal(r.coverageComplete,true);
  assert.equal(r.scheduledMinutes,480);
  assert.equal(r.scheduledDowntimeMinutes,180);
  assert.equal(r.availabilityPercent,62.5);
  assert.equal(r.mtbfScheduledMinutes,300);
  assert.equal(r.scheduledStopEpisodes,1);
});

test("máquinas em paralelo somam minutos programados e a parada de cada máquina",()=>{
  const r=run([
    mode("m1","scheduled","2026-10-12T00:00:00Z",null),
    mode("m2","scheduled","2026-10-12T00:00:00Z",null),
  ],[stop("m1","2026-10-13T12:00:00Z","2026-10-13T13:00:00Z")],
  [...machines,{machineId:"m2",createdAt:t("2026-10-01T00:00:00Z")}]);
  assert.equal(r.scheduledMinutes,2880);
  assert.equal(r.scheduledDowntimeMinutes,60);
  assert.equal(r.scheduledStopEpisodes,1);
  assert.equal(r.mtbfScheduledMinutes,2820);
  assert.equal(r.availabilityPercent,97.92);
});

test("falta de histórico não produz disponibilidade artificial de 100%",()=>{
  const r=run([mode("m1","scheduled","2026-10-13T12:00:00Z",null)]);
  assert.equal(r.availabilityPercent,null);
  assert.equal(r.mtbfScheduledMinutes,null);
  assert.equal(r.coverageComplete,false);
  assert.match(r.reason??"",/incompleto/);
});

test("lacuna interna e modos conflitantes invalidam o agregado",()=>{
  const gap=run([
    mode("m1","scheduled","2026-10-12T00:00:00Z","2026-10-13T15:00:00Z"),
    mode("m1","scheduled","2026-10-13T16:00:00Z",null),
  ]);
  assert.equal(gap.availabilityPercent,null);
  const conflict=run([
    mode("m1","scheduled","2026-10-12T00:00:00Z","2026-10-13T15:00:00Z"),
    mode("m1","not_scheduled","2026-10-13T14:00:00Z",null),
  ]);
  assert.equal(conflict.availabilityPercent,null);
});

test("nenhum período programado é indisponível, não zero disponibilidade",()=>{
  const r=run([mode("m1","not_scheduled","2026-10-12T00:00:00Z",null)]);
  assert.equal(r.coverageComplete,true);
  assert.equal(r.availabilityPercent,null);
  assert.equal(r.scheduledMinutes,0);
  assert.equal(r.mtbfScheduledMinutes,null);
});

test("sem falhas e com histórico integral a disponibilidade é 100%, MTBF indisponível",()=>{
  const r=run([mode("m1","production","2026-10-12T00:00:00Z",null)]);
  assert.equal(r.availabilityPercent,100);
  assert.equal(r.mtbfScheduledMinutes,null);
  assert.equal(r.scheduledStopEpisodes,0);
});

test("filtros impossíveis de atribuir impedem números fabricados",()=>{
  const r=calculateScheduledPerformance({machines:null,events:[],failures:[],start,effectiveEnd:end,timeZone:"America/Sao_Paulo"});
  assert.equal(r.availabilityPercent,null);
  assert.equal(r.coverageComplete,false);
  assert.match(r.reason??"",/setor e classificação/);
});

test("soma da disponibilidade diária usa recortes por dia operacional local",()=>{
  const r=run([mode("m1","scheduled","2026-10-12T00:00:00Z",null)],[stop("m1","2026-10-14T02:00:00Z","2026-10-14T04:00:00Z")]);
  assert.equal(r.scheduledMinutes,1440);
  assert.equal(r.scheduledDowntimeMinutes,120);
  assert.equal(r.daily.reduce((sum,x)=>sum+x.scheduledMinutes,0),1440);
  assert.equal(r.daily.reduce((sum,x)=>sum+x.stoppedMinutes,0),120);
});
