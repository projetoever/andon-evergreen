import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { GlobalHistoryCallDetail } from "../src/services/globalHistoryService";
import {
  historicalCallImpact, historicalProductionCoverage,
  historySessionMinutes, historyTechnicianTotals,
} from "../src/utils/globalHistoryDetailMetrics";

const source = (path: string) => readFile(new URL("../src/" + path, import.meta.url), "utf8");
const call = (patch: Record<string, unknown> = {}): GlobalHistoryCallDetail => ({
  id: "c1", machineId: "m1", openedAt: "2026-11-23T12:00:00.000Z",
  finishedAt: "2026-11-23T12:20:00.000Z", impactTrackingVersion: 1,
  machineStoppedMinutes: 5, impactIntervals: [{
    id: "i1", startedAt: "2026-11-23T12:05:00.000Z",
    endedAt: "2026-11-23T12:10:00.000Z", durationSeconds: 300, source: "call",
  }],
  productionHistory: [{
    id: "p1", machineId: "m1", productionMode: "scheduled",
    startedAt: "2026-11-23T11:00:00.000Z", endedAt: "2026-11-23T12:10:00.000Z",
  }, {
    id: "p2", machineId: "m1", productionMode: "not_scheduled",
    startedAt: "2026-11-23T12:10:00.000Z", endedAt: "2026-11-23T13:00:00.000Z",
  }],
  productionHistoryTruncated: false,
  ...patch,
} as unknown as GlobalHistoryCallDetail);
const now = "2026-11-23T12:30:00.000Z";

test("PENTE 3-G: complete historical modes separate productive stop and support without changing official stop", () => {
  const row = call();
  assert.equal(historicalProductionCoverage(row, now), true);
  const impact = historicalCallImpact(row, now);
  assert(impact);
  assert.equal(impact.productiveDowntimeSeconds, 300);
  assert.equal(impact.nonScheduledDowntimeSeconds, 0);
  assert.equal(impact.productionBlockedSupportSeconds, 300);
  assert.equal(impact.nonScheduledSupportSeconds, 600);
  assert.equal(row.machineStoppedMinutes, 5);
});

test("PENTE 3-G: missing, conflicting, or truncated production history yields unknown, not zero", () => {
  const partial = call({productionHistory: [{
    id:"p",machineId:"m1",productionMode:"scheduled",
    startedAt:"2026-11-23T12:05:00.000Z",endedAt:"2026-11-23T12:20:00.000Z",
  }]});
  assert.equal(historicalProductionCoverage(partial, now), false);
  assert.equal(historicalCallImpact(partial, now), null);
  assert.equal(historicalCallImpact(call({productionHistoryTruncated:true}), now), null);
  assert.equal(historicalCallImpact(call({impactTrackingVersion:null}), now), null);
  assert.equal(historicalCallImpact(call({productionHistory:[]}), now), null);
  const conflicted = call({productionHistory:[
    {id:"p1",machineId:"m1",productionMode:"scheduled",startedAt:"2026-11-23T11:00:00.000Z",endedAt:"2026-11-23T12:15:00.000Z"},
    {id:"p2",machineId:"m1",productionMode:"not_scheduled",startedAt:"2026-11-23T12:10:00.000Z",endedAt:"2026-11-23T13:00:00.000Z"},
  ]});
  assert.equal(historicalCallImpact(conflicted, now), null);
});

test("PENTE 3-G: individual sessions retain separate phases, and open session is not estimated", () => {
  const sessions = [
    {id:"s1",technicianName:"Celso",phase:"maintenance",startedAt:"2026-11-23T12:00:00Z",endedAt:"2026-11-23T12:04:00Z",notes:null,endReason:null},
    {id:"s2",technicianName:"celso",phase:"follow_up",startedAt:"2026-11-23T12:04:00Z",endedAt:"2026-11-23T12:07:00Z",notes:null,endReason:null},
    {id:"s3",technicianName:"Celso",phase:"maintenance",startedAt:"2026-11-23T12:09:00Z",endedAt:null,notes:null,endReason:null},
  ];
  assert.equal(historySessionMinutes(sessions[0]), 4);
  assert.equal(historySessionMinutes(sessions[2]), null);
  const totals = historyTechnicianTotals(sessions);
  assert.equal(totals.length, 1);
  assert.deepEqual([totals[0].sessions,totals[0].measuredSessions,totals[0].maintenanceMinutes,totals[0].followUpMinutes], [3,2,4,3]);
});

test("PENTE 3-G: history left sidebar fills right detail and shows impact, durations and export restrictions untouched", async () => {
  const [page,detail] = await Promise.all([source("pages/GlobalCallHistoryPage.tsx"),source("components/history/GlobalHistoryDetailSections.tsx")]);
  assert.match(page,/lg:relative/);
  assert.match(page,/lg:absolute lg:inset-0 lg:h-full/);
  assert.match(page,/lg:min-h-0/);
  assert.doesNotMatch(page,/max-h-\[65dvh\]/);
  assert.match(detail, /historySessionMinutes\(session\)/);
  assert.match(detail, /const sessions = call\.technicianSessions \?\? \[\]/);
  assert.match(detail, /historyTechnicianTotals\(sessions\)/);
  assert.match(detail, /historicalCallImpact\(call,/);
  assert.match(page, /getAuditedGlobalHistoryExport\(requested\)/);
  assert.match(page, /access\.globalHistory\?\.allowed === true/);
});
