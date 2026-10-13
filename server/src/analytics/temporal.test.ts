import assert from "node:assert/strict";
import test from "node:test";
import { buildTemporalPatterns } from "./temporal.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";

const timeZone = "America/Sao_Paulo";
const from = new Date("2026-10-12T12:00:00Z");
const end = new Date("2026-10-14T12:00:00Z");
const date = (x: string) => new Date(x);
function event(
  id: string, machineId: string, first: string, last: string | null,
  linkedCallIsSystemTest = false,
): AnalyticsFailureEventRecord {
  return {
    id, machineId, machineName: machineId, classification: null, callId: null,
    startedAt: date(first), endedAt: last ? date(last) : null, linkedCallIsSystemTest,
  };
}
function analyze(calls: Array<{id:string;openedAt:Date;isSystemTest:boolean}> = [], failureEvents: AnalyticsFailureEventRecord[] = []) {
  return buildTemporalPatterns({calls,failureEvents,start:from,effectiveEnd:end,timeZone});
}
const cell = (r: ReturnType<typeof analyze>, weekday: number, hour: number) =>
  r.heatmap.find(x=>x.weekday===weekday && x.hour===hour)!;

test("aberturas ficam na hora/dia de São Paulo, excluem testes e respeitam [start,end)", () => {
  const r = analyze([
    {id:"monday",openedAt:date("2026-10-12T13:00:00Z"),isSystemTest:false},
    {id:"tuesday",openedAt:date("2026-10-13T13:00:00Z"),isSystemTest:false},
    {id:"test",openedAt:date("2026-10-12T13:00:00Z"),isSystemTest:true},
    {id:"before",openedAt:date("2026-10-12T11:59:59Z"),isSystemTest:false},
    {id:"end",openedAt:date("2026-10-14T12:00:00Z"),isSystemTest:false},
  ]);
  assert.equal(r.totals.callsOpened,2);
  assert.equal(cell(r,1,10).callsOpened,1);
  assert.equal(cell(r,2,10).callsOpened,1);
  assert.equal(r.totals.peakCallHour,10);
  assert.equal(r.byHour.length,24);
  assert.equal(r.byWeekday.length,7);
  assert.equal(r.heatmap.length,168);
});

test("união por máquina impede dupla contagem e soma máquinas distintas", () => {
  const r=analyze([],[
    event("e1","a","2026-10-12T13:10:00Z","2026-10-12T14:10:00Z"),
    event("e2","a","2026-10-12T13:40:00Z","2026-10-12T14:40:00Z"),
    event("e3","b","2026-10-12T13:30:00Z","2026-10-12T14:30:00Z"),
  ]);
  assert.equal(r.totals.physicalDowntimeMinutes,150);
  assert.equal(r.totals.physicalEpisodes,2);
  assert.equal(cell(r,1,10).downtimeMinutes,80);
  assert.equal(cell(r,1,11).downtimeMinutes,70);
  assert.equal(r.totals.peakPhysicalHour,10);
  assert.equal(r.byHour.reduce((total,b)=>total+b.downtimeMinutes,0),150);
});

test("eventos antigos ainda abertos contribuem para a janela, sem inventar novas falhas", () => {
  const r=analyze([],[
    event("old","m","2026-09-01T00:00:00Z",null),
    event("marked-test","x","2026-10-12T13:00:00Z",null,true),
  ]);
  assert.equal(r.totals.callsOpened,0);
  assert.equal(r.totals.peakCallHour,null);
  assert.equal(r.totals.physicalDowntimeMinutes,48*60);
  assert.equal(r.totals.physicalEpisodes,1);
});

test("eventos cruzando meia-noite são divididos por dia/hora locais",()=>{
  const r=analyze([], [
    event("cross","m","2026-10-13T02:30:00Z","2026-10-13T03:30:00Z"),
  ]);
  assert.equal(r.totals.physicalDowntimeMinutes,60);
  assert.equal(cell(r,1,23).downtimeMinutes,30);
  assert.equal(cell(r,2,0).downtimeMinutes,30);
});

test("picos empatados não inventam um horário mais crítico",()=>{
  const r=analyze([
    {id:"ten",openedAt:date("2026-10-12T13:00:00Z"),isSystemTest:false},
    {id:"eleven",openedAt:date("2026-10-12T14:00:00Z"),isSystemTest:false},
  ], [event("all-day","m","2026-10-12T12:00:00Z","2026-10-14T12:00:00Z")]);
  assert.equal(r.totals.peakCallHour,null);
  assert.deepEqual(r.totals.peakCallHours,[10,11]);
  assert.equal(r.totals.peakPhysicalHour,null);
  assert.equal(r.totals.peakPhysicalHours.length,24);
  assert.equal(r.totals.physicalDowntimeMinutes,2880);
});

test("janela vazia não confunde zero com pico",()=>{
  const r=analyze();
  assert.equal(r.totals.peakCallHour,null);
  assert.equal(r.totals.peakPhysicalHour,null);
  assert.deepEqual(r.totals.peakCallHours,[]);
  assert.deepEqual(r.totals.peakPhysicalHours,[]);
});
