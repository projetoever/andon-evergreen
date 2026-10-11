import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExecutiveOverview,
  buildExecutiveHighlights,
  buildOverviewComparison,
  calculatePhysicalDowntimeByMachine,
  calculatePhysicalDowntimeTrend,
  parseAnalyticsInstant,
  type AnalyticsCallRecord,
  type AnalyticsFailureEventRecord,
} from "./overview.js";

function date(value: string) {
  return new Date(value);
}

test("analytics exige timestamps com fuso explícito", () => {
  assert.equal(parseAnalyticsInstant("2026-10-01T00:00:00"), null);
  assert.equal(parseAnalyticsInstant("2026-10-01"), null);
  assert.equal(
    parseAnalyticsInstant("2026-10-01T00:00:00-03:00")?.toISOString(),
    "2026-10-01T03:00:00.000Z",
  );
  assert.equal(
    parseAnalyticsInstant("2026-10-01T03:00:00Z")?.toISOString(),
    "2026-10-01T03:00:00.000Z",
  );
});

test("downtime físico une intervalos simultâneos da mesma máquina", () => {
  const events: AnalyticsFailureEventRecord[] = [
    {
      id: "f1",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T10:30:00Z"),
      classification: "sensor",
      callId: "c1",
      linkedCallIsSystemTest: false,
    },
    {
      id: "f2",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-01T10:20:00Z"),
      endedAt: date("2026-10-01T10:50:00Z"),
      classification: "sensor",
      callId: "c2",
      linkedCallIsSystemTest: false,
    },
    {
      id: "f3",
      machineId: "31",
      machineName: "Máquina 31",
      startedAt: date("2026-10-01T10:10:00Z"),
      endedAt: date("2026-10-01T10:20:00Z"),
      classification: "mechanical",
      callId: null,
      linkedCallIsSystemTest: false,
    },
  ];

  const result = calculatePhysicalDowntimeByMachine(
    events,
    date("2026-10-01T10:00:00Z"),
    date("2026-10-01T11:00:00Z"),
  );

  assert.deepEqual(result, [
    {
      machineId: "55",
      machineName: "Máquina 55",
      downtimeMinutes: 50,
    },
    {
      machineId: "31",
      machineName: "Máquina 31",
      downtimeMinutes: 10,
    },
  ]);
});

test("downtime recorta evento aberto ao período e ignora teste de sistema", () => {
  const result = calculatePhysicalDowntimeByMachine(
    [
      {
        id: "open",
        machineId: "9",
        machineName: "Máquina 9",
        startedAt: date("2026-10-01T09:30:00Z"),
        endedAt: null,
        classification: "electrical",
        callId: "real",
        linkedCallIsSystemTest: false,
      },
      {
        id: "test",
        machineId: "10",
        machineName: "Máquina 10",
        startedAt: date("2026-10-01T10:00:00Z"),
        endedAt: null,
        classification: "electrical",
        callId: "system",
        linkedCallIsSystemTest: true,
      },
    ],
    date("2026-10-01T10:00:00Z"),
    date("2026-10-01T10:15:00Z"),
  );

  assert.deepEqual(result, [
    {
      machineId: "9",
      machineName: "Máquina 9",
      downtimeMinutes: 15,
    },
  ]);
});

test("overview calcula somente métricas suportadas pelos registros reais", () => {
  const calls: AnalyticsCallRecord[] = [
    {
      id: "c1",
      machineId: "55",
      subtype: "electrical",
      status: "finished",
      openedAt: date("2026-10-01T10:00:00Z"),
      attendedAt: date("2026-10-01T10:10:00Z"),
      maintenanceCompletedAt: date("2026-10-01T10:40:00Z"),
      finishedAt: date("2026-10-01T11:00:00Z"),
      attendanceMinutes: 30,
      postMaintenanceMinutes: 20,
      maintenanceReturnCount: 1,
      failureClassification: "sensor",
      isSystemTest: false,
    },
    {
      id: "c2",
      machineId: "31",
      subtype: "mechanical",
      status: "finished",
      openedAt: date("2026-10-01T11:00:00Z"),
      attendedAt: date("2026-10-01T11:20:00Z"),
      maintenanceCompletedAt: date("2026-10-01T11:50:00Z"),
      finishedAt: date("2026-10-01T12:00:00Z"),
      attendanceMinutes: 40,
      postMaintenanceMinutes: 10,
      maintenanceReturnCount: 0,
      failureClassification: "mechanical",
      isSystemTest: false,
    },
    {
      id: "system",
      machineId: "99",
      subtype: "electrical",
      status: "finished",
      openedAt: date("2026-10-01T10:00:00Z"),
      attendedAt: date("2026-10-01T10:01:00Z"),
      maintenanceCompletedAt: date("2026-10-01T10:02:00Z"),
      finishedAt: date("2026-10-01T10:03:00Z"),
      attendanceMinutes: 1,
      postMaintenanceMinutes: 1,
      maintenanceReturnCount: 0,
      failureClassification: "test",
      isSystemTest: true,
    },
  ];

  const failureEvents: AnalyticsFailureEventRecord[] = [
    {
      id: "f1",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T10:30:00Z"),
      classification: "sensor",
      callId: "c1",
      linkedCallIsSystemTest: false,
    },
    {
      id: "f2",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-01T10:20:00Z"),
      endedAt: date("2026-10-01T10:50:00Z"),
      classification: "sensor",
      callId: "c1",
      linkedCallIsSystemTest: false,
    },
    {
      id: "f3",
      machineId: "31",
      machineName: "Máquina 31",
      startedAt: date("2026-10-01T11:00:00Z"),
      endedAt: date("2026-10-01T11:10:00Z"),
      classification: "mechanical",
      callId: "c2",
      linkedCallIsSystemTest: false,
    },
    {
      id: "system-event",
      machineId: "99",
      machineName: "Máquina 99",
      startedAt: date("2026-10-01T10:00:00Z"),
      endedAt: date("2026-10-01T12:00:00Z"),
      classification: "test",
      callId: "system",
      linkedCallIsSystemTest: true,
    },
  ];

  const result = buildExecutiveOverview({
    calls,
    activeCallsNow: 3,
    failureEvents,
    start: date("2026-10-01T09:00:00Z"),
    end: date("2026-10-01T13:00:00Z"),
    effectiveEnd: date("2026-10-01T13:00:00Z"),
    generatedAt: date("2026-10-01T13:00:00Z"),
    timeZone: "America/Sao_Paulo",
    filters: {},
  });

  assert.equal(result.kpis.callsOpened, 2);
  assert.equal(result.kpis.callsFinished, 2);
  assert.equal(result.kpis.activeCallsNow, 3);
  assert.equal(result.kpis.mttaMinutes, 15);
  assert.equal(result.kpis.avgMaintenanceMinutes, 35);
  assert.equal(result.kpis.avgPostMaintenanceMinutes, 15);
  assert.equal(result.kpis.avgTotalCallMinutes, 60);
  assert.equal(result.kpis.downtimeMinutes, 60);
  assert.equal(result.kpis.failureOccurrences, 3);
  assert.equal(result.kpis.returnedCalls, 1);
  assert.equal(result.kpis.maintenanceReturnCycles, 1);
  assert.equal(result.kpis.maintenanceReturnRatePercent, 50);
  assert.equal(result.coverage.mttaSampleSize, 2);
  assert.equal(result.coverage.finishedCallsWithClassification, 2);
  assert.deepEqual(
    result.machinePareto.map((item) => [
      item.machineId,
      item.downtimeMinutes,
      item.occurrences,
    ]),
    [
      ["55", 50, 2],
      ["31", 10, 1],
    ],
  );
  assert.deepEqual(result.classificationPareto, [
    { label: "mechanical", count: 1 },
    { label: "sensor", count: 1 },
  ]);
  assert.deepEqual(result.sectorDistribution, [
    { label: "electrical", count: 1 },
    { label: "mechanical", count: 1 },
  ]);
});


test("downtime diário respeita meia-noite operacional e mantém união por máquina", () => {
  const events: AnalyticsFailureEventRecord[] = [
    {
      id: "overnight-a",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-02T02:30:00Z"),
      endedAt: date("2026-10-02T03:30:00Z"),
      classification: "sensor",
      callId: "c1",
      linkedCallIsSystemTest: false,
    },
    {
      id: "overnight-overlap",
      machineId: "55",
      machineName: "Máquina 55",
      startedAt: date("2026-10-02T03:10:00Z"),
      endedAt: date("2026-10-02T03:40:00Z"),
      classification: "sensor",
      callId: "c2",
      linkedCallIsSystemTest: false,
    },
  ];

  const trend = calculatePhysicalDowntimeTrend(
    events,
    date("2026-10-02T02:00:00Z"),
    date("2026-10-02T04:00:00Z"),
    "America/Sao_Paulo",
  );

  assert.deepEqual(trend, [
    { date: "2026-10-01", downtimeMinutes: 30 },
    { date: "2026-10-02", downtimeMinutes: 40 },
  ]);
});

test("comparação executiva e destaques permanecem determinísticos", () => {
  const current = buildExecutiveOverview({
    calls: [
      {
        id: "current",
        machineId: "55",
        subtype: "electrical",
        status: "finished",
        openedAt: date("2026-10-02T10:00:00Z"),
        attendedAt: date("2026-10-02T10:10:00Z"),
        maintenanceCompletedAt: date("2026-10-02T10:20:00Z"),
        finishedAt: date("2026-10-02T10:30:00Z"),
        attendanceMinutes: 10,
        postMaintenanceMinutes: 10,
        maintenanceReturnCount: 0,
        failureClassification: "sensor",
        isSystemTest: false,
      },
    ],
    activeCallsNow: 0,
    failureEvents: [
      {
        id: "current-stop",
        machineId: "55",
        machineName: "Máquina 55",
        startedAt: date("2026-10-02T10:00:00Z"),
        endedAt: date("2026-10-02T10:30:00Z"),
        classification: "sensor",
        callId: "current",
        linkedCallIsSystemTest: false,
      },
    ],
    start: date("2026-10-02T09:00:00Z"),
    end: date("2026-10-02T11:00:00Z"),
    effectiveEnd: date("2026-10-02T11:00:00Z"),
    generatedAt: date("2026-10-02T11:00:00Z"),
    timeZone: "America/Sao_Paulo",
    filters: {},
  });

  const previous = buildExecutiveOverview({
    calls: [],
    activeCallsNow: null,
    failureEvents: [],
    start: date("2026-10-02T07:00:00Z"),
    end: date("2026-10-02T09:00:00Z"),
    effectiveEnd: date("2026-10-02T09:00:00Z"),
    generatedAt: date("2026-10-02T11:00:00Z"),
    timeZone: "America/Sao_Paulo",
    filters: {},
  });

  const comparison = buildOverviewComparison(current, previous);
  const highlights = buildExecutiveHighlights(current);

  assert.equal(comparison.callsOpened.direction, "new");
  assert.equal(comparison.downtimeMinutes.direction, "new");
  assert.equal(highlights.topMachine?.machineId, "55");
  assert.equal(highlights.topMachine?.sharePercent, 100);
  assert.equal(highlights.topClassification?.classification, "sensor");
  assert.equal(highlights.topSector?.subtype, "electrical");
});
