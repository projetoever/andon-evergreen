import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMachine360,
  type Machine360Input,
  type Machine360Call,
  type Machine360Failure,
} from "./machine360.js";

const dt = (iso: string) => new Date(iso);
const periodStart = dt("2026-10-07T00:00:00Z");
const periodEnd = dt("2026-10-08T00:00:00Z");

function call(id: string, opened: string, finished: string | null, extras: Partial<Machine360Call> = {}): Machine360Call {
  return {
    id,
    machineId: "m9",
    subtype: "mechanical",
    status: finished ? "finished" : "in_progress",
    openedAt: dt(opened),
    attendedAt: dt(opened),
    finishedAt: finished ? dt(finished) : null,
    attendanceMinutes: 20,
    failureClassification: "sensor",
    failureDescription: "Sensor intermitente",
    workOrderNumber: "123",
    maintenanceReturnCount: 0,
    technicianNames: ["Técnico A"],
    isSystemTest: false,
    machineSetNameSnapshot: "Esteira",
    machineSubsetNameSnapshot: "Motor",
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSubsetNameSnapshot: null,
    ...extras,
  };
}

function event(id: string, started: string, ended: string | null, extras: Partial<Machine360Failure> = {}): Machine360Failure {
  return {
    id,
    machineId: "m9",
    startedAt: dt(started),
    endedAt: ended ? dt(ended) : null,
    classification: "sensor",
    callId: "a",
    notes: "Parada",
    linkedCallIsSystemTest: false,
    ...extras,
  };
}

function build(partial: Partial<Machine360Input> = {}) {
  const base: Machine360Input = {
    machine: {
      id: "m9",
      name: "Máquina 9",
      isActive: true,
      machineStatus: "stopped",
      productionMode: "scheduled",
      createdAt: dt("2026-09-01T00:00:00Z"),
    },
    calls: [],
    activeCalls: [],
    events: [],
    activeSessions: [],
    start: periodStart,
    effectiveEnd: periodEnd,
  };
  return buildMachine360({ ...base, ...partial });
}

test("Machine 360 une intervalos físicos e não soma FailureEvents nem pessoa-minutos", () => {
  const result = build({
    events: [
      event("one", "2026-10-07T10:00:00Z", "2026-10-07T10:40:00Z"),
      event("two", "2026-10-07T10:20:00Z", "2026-10-07T11:00:00Z"),
      event("three", "2026-10-07T11:30:00Z", null),
    ],
  });
  assert.equal(result.kpis.physicalStopEpisodes, 2);
  assert.equal(result.kpis.downtimeMinutes, 810);
  assert.equal(result.kpis.avgDowntimePerEpisodeMinutes, 405);
  assert.equal(result.timeline.total, 3);
  assert.equal(result.dataHealth.openFailureEvents, 1);
  assert.equal(result.dataHealth.oldestOpenFailureMinutes, 750);
});

test("Machine 360 conta coortes por tempo, preserva snapshot de ativo e exclui testes", () => {
  const c1 = call("a", "2026-10-06T23:00:00Z", "2026-10-07T02:00:00Z", {
    attendedAt: dt("2026-10-07T01:00:00Z"),
    maintenanceReturnCount: 2,
    confirmedMachineSetNameSnapshot: "Transportador confirmado",
    confirmedMachineSubsetNameSnapshot: "Sensor confirmado",
  });
  const c2 = call("b", "2026-10-07T03:00:00Z", "2026-10-07T04:00:00Z", {
    failureClassification: null,
    attendanceMinutes: 40,
  });
  const testing = call("test", "2026-10-07T05:00:00Z", "2026-10-07T06:00:00Z", {
    isSystemTest: true,
  });
  const result = build({
    calls: [c1, c2, testing],
    activeCalls: [call("active", "2026-10-06T08:00:00Z", null)],
    activeSessions: [{ id: "session", startedAt: dt("2026-10-07T09:00:00Z") }],
    events: [event("test", "2026-10-07T00:00:00Z", "2026-10-07T03:00:00Z", {
      linkedCallIsSystemTest: true,
    })],
  });
  assert.equal(result.kpis.callsOpened, 1);
  assert.equal(result.kpis.callsFinished, 2);
  assert.equal(result.kpis.callsActiveNow, 1);
  assert.equal(result.kpis.activeSessionsNow, 1);
  assert.equal(result.kpis.maintenanceReturnCycles, 2);
  assert.equal(result.kpis.avgMaintenanceMinutes, 30);
  assert.equal(result.kpis.mttaMinutes, 60);
  assert.equal(result.kpis.downtimeMinutes, 0);
  assert.deepEqual(result.assets[0], {
    setName: "Transportador confirmado",
    subsetName: "Sensor confirmado",
    calls: 1,
  });
  assert.equal(result.dataHealth.finishedWithoutClassification, 1);
  assert.equal(result.timeline.total, 2);
  assert.ok(result.timeline.items.every(item => item.id !== "test"));
});

test("Machine 360 mantém indisponível o MTBF sem episódios e destaca órfãos", () => {
  const result = build({
    events: [event("orphan", "2026-10-07T10:00:00Z", null, {
      callId: null,
      classification: null,
    })],
  });
  assert.equal(result.kpis.physicalStopEpisodes, 1);
  assert.equal(result.dataHealth.standaloneFailureEvents, 1);
  const noEvents = build();
  assert.equal(noEvents.kpis.mtbfEstimatedMinutes, null);
  assert.equal(noEvents.kpis.avgDowntimePerEpisodeMinutes, null);
  assert.equal(noEvents.kpis.mttaMinutes, null);
});

test("Machine 360 recorta eventos nos limites e restringe timeline a 40 sem alterar totais", () => {
  const many = Array.from({ length: 45 }, (_, i) =>
    call(String(i), "2026-10-07T01:00:00Z", "2026-10-07T02:00:00Z"),
  );
  const result = build({
    calls: many,
    events: [event("clip", "2026-10-06T23:30:00Z", "2026-10-07T00:30:00Z")],
  });
  assert.equal(result.kpis.downtimeMinutes, 30);
  assert.equal(result.kpis.callsFinished, 45);
  assert.equal(result.timeline.total, 46);
  assert.equal(result.timeline.items.length, 40);
  assert.equal(result.timeline.truncated, true);
});
