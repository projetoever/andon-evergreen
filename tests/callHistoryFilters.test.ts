import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CALL_HISTORY_FILTERS,
  DEFAULT_GLOBAL_CALL_HISTORY_FILTERS,
  filterCallHistory,
  filterGlobalCallHistory,
  hasActiveGlobalCallHistoryFilters,
  compareCallHistoryChronology,
  listCallHistoryTechnicians,
  type CallHistoryFilters,
} from "../src/utils/callHistoryFilters";
import type { AndonCall } from "../src/types/andon";

function createCall(overrides: Partial<AndonCall> = {}): AndonCall {
  return {
    id: "call-1",
    machineId: "9",
    category: "maintenance",
    subtype: "electrical",
    workOrderNumber: "OS-1001",
    status: "finished",
    criticality: "medium",
    machineCondition: "stopped",
    openedAt: "2026-10-03T12:00:00-03:00",
    attendedAt: "2026-10-03T12:05:00-03:00",
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: "2026-10-03T12:30:00-03:00",
    finishedAt: "2026-10-03T12:35:00-03:00",
    technicianName: "João Silva",
    technicianNames: ["João Silva"],
    technicianSessions: [],
    technicianTimeAllocations: [],
    technicianArea: "electrical",
    callWaitingMinutes: 5,
    attendanceMinutes: 25,
    postMaintenanceMinutes: 5,
    maintenanceReturnCount: 0,
    totalCallMinutes: 35,
    machineStoppedMinutes: 20,
    notes: "Falha no sensor principal",
    failureClassification: "electrical_failure",
    failureDescription: "Sensor sem leitura",
    createdBy: null,
    origin: "kiosk",
    isSystemTest: false,
    updatedAt: "2026-10-03T12:35:00-03:00",
    ...overrides,
  };
}

function withFilters(patch: Partial<CallHistoryFilters>): CallHistoryFilters {
  return { ...DEFAULT_CALL_HISTORY_FILTERS, ...patch };
}

test("pesquisa rápida encontra OS sem depender de caixa ou acento", () => {
  const calls = [
    createCall({ id: "a", workOrderNumber: "OS-ABC-123" }),
    createCall({ id: "b", workOrderNumber: "OS-999" }),
  ];

  const result = filterCallHistory(calls, withFilters({ query: "abc-123" }));

  assert.deepEqual(result.map((call) => call.id), ["a"]);
});

test("pesquisa rápida também encontra ID, mantenedor e descrição", () => {
  const calls = [
    createCall({
      id: "chamado-especial",
      technicianNames: ["José Mecânico"],
      failureDescription: "Correia desalinhada",
    }),
  ];

  assert.equal(filterCallHistory(calls, withFilters({ query: "especial" })).length, 1);
  assert.equal(filterCallHistory(calls, withFilters({ query: "jose mecanico" })).length, 1);
  assert.equal(filterCallHistory(calls, withFilters({ query: "correia" })).length, 1);
});

test("combina filtros de área e status", () => {
  const calls = [
    createCall({ id: "electrical-finished", subtype: "electrical", status: "finished" }),
    createCall({ id: "mechanical-finished", subtype: "mechanical", status: "finished" }),
    createCall({ id: "electrical-open", subtype: "electrical", status: "open", finishedAt: null }),
  ];

  const result = filterCallHistory(
    calls,
    withFilters({ subtype: "electrical", status: "finished" }),
  );

  assert.deepEqual(result.map((call) => call.id), ["electrical-finished"]);
});

test("filtro por dia usa o dia de abertura do chamado", () => {
  const calls = [
    createCall({ id: "day-3", openedAt: "2026-10-03T10:00:00-03:00" }),
    createCall({ id: "day-2", openedAt: "2026-10-02T10:00:00-03:00" }),
  ];

  const result = filterCallHistory(
    calls,
    withFilters({ period: "custom", customDate: "2026-10-03" }),
  );

  assert.deepEqual(result.map((call) => call.id), ["day-3"]);
});

test("atalho últimos 7 dias exclui chamados antigos", () => {
  const calls = [
    createCall({ id: "today", openedAt: "2026-10-03T12:00:00Z" }),
    createCall({ id: "six-days", openedAt: "2026-09-27T12:00:00Z" }),
    createCall({ id: "seven-days", openedAt: "2026-09-26T12:00:00Z" }),
  ];

  const result = filterCallHistory(
    calls,
    withFilters({ period: "7d" }),
    new Map(),
    new Date("2026-10-03T15:00:00Z"),
  );

  assert.deepEqual(
    result.map((call) => call.id).sort(),
    ["six-days", "today"],
  );
});

test("filtro por mantenedor considera sessões além do nome consolidado", () => {
  const calls = [
    createCall({
      id: "session-tech",
      technicianName: null,
      technicianNames: [],
      technicianSessions: [
        {
          id: "session-1",
          callId: "session-tech",
          machineId: "9",
          technicianName: "Carlos Apoio",
          startedAt: "2026-10-03T12:05:00-03:00",
        },
      ],
    }),
  ];

  const result = filterCallHistory(calls, withFilters({ technician: "Carlos Apoio" }));

  assert.equal(result.length, 1);
  assert.deepEqual(listCallHistoryTechnicians(calls), ["Carlos Apoio"]);
});

test("classificação resolvida pelo histórico vinculado participa do filtro", () => {
  const calls = [createCall({ id: "legacy", failureClassification: null })];
  const details = new Map([
    ["legacy", { classification: "mechanical_failure", description: "Falha antiga" }],
  ]);

  const result = filterCallHistory(
    calls,
    withFilters({ failureClassification: "mechanical_failure" }),
    details,
  );

  assert.equal(result.length, 1);
});

test("origem separa chamados reais de testes automáticos", () => {
  const calls = [
    createCall({ id: "real", isSystemTest: false }),
    createCall({ id: "system", isSystemTest: true }),
  ];

  assert.deepEqual(
    filterCallHistory(calls, withFilters({ origin: "real" })).map((call) => call.id),
    ["real"],
  );
  assert.deepEqual(
    filterCallHistory(calls, withFilters({ origin: "system" })).map((call) => call.id),
    ["system"],
  );
});

test("resultado permanece ordenado do mais recente para o mais antigo", () => {
  const calls = [
    createCall({
      id: "old",
      openedAt: "2026-10-01T10:00:00Z",
      finishedAt: "2026-10-01T11:00:00Z",
    }),
    createCall({
      id: "new",
      openedAt: "2026-10-03T10:00:00Z",
      finishedAt: "2026-10-03T11:00:00Z",
    }),
  ];

  assert.deepEqual(
    filterCallHistory(calls, DEFAULT_CALL_HISTORY_FILTERS).map((call) => call.id),
    ["new", "old"],
  );
});


test("HIST-01: opening chronology is stable even if an old call completes later", () => {
  const historical = createCall({
    id: "historical-old", machineId: "11",
    openedAt: "2026-10-01T10:00:00Z", finishedAt: "2026-11-12T23:55:00Z",
  });
  const recent = createCall({
    id: "recent-open", machineId: "15",
    openedAt: "2026-11-12T21:00:00Z", finishedAt: null, status: "open",
  });
  const calls = [historical, recent];
  assert.deepEqual(
    filterCallHistory(calls, DEFAULT_CALL_HISTORY_FILTERS).map(c => c.id),
    ["historical-old", "recent-open"], "legacy machine ordering is preserved",
  );
  assert.deepEqual(
    filterGlobalCallHistory(calls, DEFAULT_GLOBAL_CALL_HISTORY_FILTERS).map(c => c.id),
    ["recent-open", "historical-old"], "new global list uses opening, not finish",
  );
  assert.deepEqual(calls.map(c => c.id), ["historical-old", "recent-open"],
    "filtering never mutates source arrays");
});

test("HIST-01: global machine selection composes with all existing history filters", () => {
  const items = [
    createCall({ id: "15_electric", machineId: "15", subtype: "electrical",
      workOrderNumber: "OS-223", status: "finished", technicianName: "Carlos",
      technicianNames: ["Carlos"] }),
    createCall({ id: "11_electric", machineId: "11", subtype: "electrical",
      workOrderNumber: "OS-223", status: "finished", technicianName: "Carlos",
      technicianNames: ["Carlos"] }),
    createCall({ id: "15_mechanic", machineId: "15", subtype: "mechanical",
      workOrderNumber: "OS-223", status: "finished", technicianName: "Carlos",
      technicianNames: ["Carlos"] }),
    createCall({ id: "15_system", machineId: "15", subtype: "electrical",
      workOrderNumber: "OS-223", status: "finished", isSystemTest: true,
      technicianName: "Carlos", technicianNames: ["Carlos"] }),
  ];
  const filters = { ...DEFAULT_GLOBAL_CALL_HISTORY_FILTERS,
    machineId: "15", query: "os-223", subtype: "electrical",
    status: "finished" as const, technician: "Carlos",
    origin: "real" as const,
  };
  assert.deepEqual(
    filterGlobalCallHistory(items, filters).map(c => c.id),
    ["15_electric"],
  );
  assert.equal(hasActiveGlobalCallHistoryFilters(filters), true);
  assert.equal(hasActiveGlobalCallHistoryFilters(DEFAULT_GLOBAL_CALL_HISTORY_FILTERS), false);
});

test("HIST-01: duplicate opening time has stable ID tiebreak, invalid times sort last", () => {
  const calls = [
    createCall({id: "b", openedAt: "2026-11-12T21:00:00Z"}),
    createCall({id: "invalid", openedAt: "bad legacy date"}),
    createCall({id: "a", openedAt: "2026-11-12T18:00:00-03:00"}),
  ];
  assert.deepEqual(
    filterGlobalCallHistory(calls, DEFAULT_GLOBAL_CALL_HISTORY_FILTERS).map(c => c.id),
    ["a","b","invalid"],
  );
  assert.equal(compareCallHistoryChronology(calls[0], calls[2], "openedAt") > 0, true);
});
