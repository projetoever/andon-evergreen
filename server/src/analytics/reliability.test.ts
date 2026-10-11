import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssetReliability,
  type ReliabilityActiveSessionRecord,
  type ReliabilityCallRecord,
  type ReliabilityFailureEventRecord,
  type ReliabilityMachineRecord,
} from "./reliability.js";

function date(value: string) {
  return new Date(value);
}

test("bad actor mantém downtime físico unido e MTBF estimado por máquina", () => {
  const machines: ReliabilityMachineRecord[] = [
    {
      id: "m1",
      name: "Máquina 1",
      isActive: true,
      createdAt: date("2026-10-01T00:00:00Z"),
    },
  ];
  const events: ReliabilityFailureEventRecord[] = [
    {
      id: "e1",
      machineId: "m1",
      startedAt: date("2026-10-02T10:00:00Z"),
      endedAt: date("2026-10-02T10:30:00Z"),
      classification: "sensor",
      callId: "c1",
    },
    {
      id: "e2",
      machineId: "m1",
      startedAt: date("2026-10-02T10:20:00Z"),
      endedAt: date("2026-10-02T10:40:00Z"),
      classification: "sensor",
      callId: "c2",
    },
    {
      id: "e3",
      machineId: "m1",
      startedAt: date("2026-10-02T11:00:00Z"),
      endedAt: date("2026-10-02T11:20:00Z"),
      classification: "motor",
      callId: "c3",
    },
  ];

  const result = buildAssetReliability({
    machines,
    failureEvents: events,
    calls: [],
    activeCalls: [],
    activeSessions: [],
    start: date("2026-10-02T10:00:00Z"),
    effectiveEnd: date("2026-10-02T12:00:00Z"),
  });

  assert.equal(result.assets[0].downtimeMinutes, 60);
  assert.equal(result.assets[0].physicalStopEpisodes, 2);
  assert.equal(result.assets[0].avgDowntimePerEpisodeMinutes, 30);
  assert.equal(result.assets[0].mtbfEstimatedMinutes, 30);
});

test("reincidência é diagnóstico repetido e retorno permanece métrica separada", () => {
  const machines: ReliabilityMachineRecord[] = [
    {
      id: "m1",
      name: "Máquina 1",
      isActive: true,
      createdAt: date("2026-10-01T00:00:00Z"),
    },
  ];
  const calls: ReliabilityCallRecord[] = [
    {
      id: "c1",
      machineId: "m1",
      status: "finished",
      openedAt: date("2026-10-02T09:00:00Z"),
      finishedAt: date("2026-10-02T09:30:00Z"),
      failureClassification: "sensor",
      maintenanceReturnCount: 0,
    },
    {
      id: "c2",
      machineId: "m1",
      status: "finished",
      openedAt: date("2026-10-02T10:00:00Z"),
      finishedAt: date("2026-10-02T10:30:00Z"),
      failureClassification: "sensor",
      maintenanceReturnCount: 2,
    },
    {
      id: "c3",
      machineId: "m1",
      status: "finished",
      openedAt: date("2026-10-02T11:00:00Z"),
      finishedAt: date("2026-10-02T11:30:00Z"),
      failureClassification: "motor",
      maintenanceReturnCount: 0,
    },
  ];

  const result = buildAssetReliability({
    machines,
    failureEvents: [],
    calls,
    activeCalls: [],
    activeSessions: [],
    start: date("2026-10-02T08:00:00Z"),
    effectiveEnd: date("2026-10-02T12:00:00Z"),
  });

  assert.equal(result.assets[0].repeatDiagnosisCount, 1);
  assert.equal(result.assets[0].maintenanceReturnCycles, 2);
  assert.deepEqual(result.assets[0].topDiagnosis, {
    classification: "sensor",
    count: 2,
  });
});

test("saúde do dado destaca chamados, eventos e sessões abertas acima de 24 horas", () => {
  const machines: ReliabilityMachineRecord[] = [
    {
      id: "m1",
      name: "Máquina 1",
      isActive: true,
      createdAt: date("2026-10-01T00:00:00Z"),
    },
  ];
  const activeCalls: ReliabilityCallRecord[] = [
    {
      id: "active",
      machineId: "m1",
      status: "in_progress",
      openedAt: date("2026-10-01T08:00:00Z"),
      finishedAt: null,
      failureClassification: null,
      maintenanceReturnCount: 0,
    },
  ];
  const events: ReliabilityFailureEventRecord[] = [
    {
      id: "open",
      machineId: "m1",
      startedAt: date("2026-10-01T09:00:00Z"),
      endedAt: null,
      classification: null,
      callId: null,
    },
  ];
  const sessions: ReliabilityActiveSessionRecord[] = [
    {
      id: "session",
      machineId: "m1",
      startedAt: date("2026-10-01T10:00:00Z"),
    },
  ];

  const result = buildAssetReliability({
    machines,
    failureEvents: events,
    calls: [],
    activeCalls,
    activeSessions: sessions,
    start: date("2026-10-01T00:00:00Z"),
    effectiveEnd: date("2026-10-02T12:00:00Z"),
  });

  assert.equal(result.dataHealth.activeCallsOver24h, 1);
  assert.equal(result.dataHealth.openFailureEventsOver24h, 1);
  assert.equal(result.dataHealth.activeSessionsOver24h, 1);
  assert.equal(result.dataHealth.standaloneFailureEvents, 1);
  assert.equal(result.assets[0].activeCallCount, 1);
  assert.equal(result.assets[0].openFailureEventCount, 1);
});
