import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFailureIntelligence,
  type FailureIntelligenceCall,
} from "./failureIntelligence.js";

const at = (iso: string) => new Date(iso);

function call(
  id: string,
  finished: string,
  options: Partial<FailureIntelligenceCall> = {},
): FailureIntelligenceCall {
  return {
    id,
    machineId: "m9",
    machineName: "Máquina 9",
    subtype: "mechanical",
    openedAt: at(finished),
    finishedAt: at(finished),
    classification: "sensor",
    description: "Falha no sensor",
    workOrderNumber: "OS-9",
    maintenanceReturnCount: 0,
    isSystemTest: false,
    confirmedMachineSetId: null,
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSubsetId: null,
    confirmedMachineSubsetNameSnapshot: null,
    machineSetId: "set-open",
    machineSetNameSnapshot: "Esteira",
    machineSubsetId: "sub-open",
    machineSubsetNameSnapshot: "Motor",
    ...options,
  };
}

const start = at("2026-10-07T00:00:00Z");
const end = at("2026-10-08T00:00:00Z");

test("recorrência conta só coorte concluída, inclui antecedente anterior ao período", () => {
  const result = buildFailureIntelligence({
    calls: [
      call("old", "2026-10-06T23:30:00Z"),
      call("new", "2026-10-07T01:00:00Z", {
        confirmedMachineSetId: "set-confirmed",
        confirmedMachineSetNameSnapshot: "Conjunto confirmado",
        confirmedMachineSubsetId: "sub-confirmed",
        confirmedMachineSubsetNameSnapshot: "Sensor confirmado",
        maintenanceReturnCount: 3,
      }),
      call("different-machine", "2026-10-07T02:00:00Z", {
        machineId: "m10",
        machineName: "Máquina 10",
      }),
      call("different-diagnosis", "2026-10-07T03:00:00Z", {
        classification: "motor",
      }),
      call("system-test", "2026-10-07T04:00:00Z", {
        isSystemTest: true,
      }),
      call("open", "2026-10-07T05:00:00Z", {
        classification: null,
      }),
    ],
    start,
    effectiveEnd: end,
    filters: { machineId: "m9" },
  });

  assert.equal(result.totals.diagnosedFinishedCalls, 2);
  assert.equal(result.totals.repeated24h, 1);
  assert.equal(result.totals.repeated7d, 1);
  assert.equal(result.totals.repeated30d, 1);
  assert.equal(result.totals.maintenanceReturnCycles, 3);
  assert.equal(result.totals.repeatRate30dPercent, 50);
  assert.equal(result.groups[0].cases[0].setName, "Conjunto confirmado");
  assert.equal(result.groups[0].cases[0].subsetName, "Sensor confirmado");
  assert.equal(result.groups[0].cases[0].gapSincePreviousHours, 1.5);
});

test("janelas 24h, 7d e 30d são cumulativas e independentes dos retornos", () => {
  const result = buildFailureIntelligence({
    calls: [
      call("old", "2026-09-20T00:00:00Z"),
      call("repeat-30d", "2026-10-07T10:00:00Z", {
        maintenanceReturnCount: 2,
      }),
      call("repeat-24h", "2026-10-07T11:00:00Z"),
    ],
    start,
    effectiveEnd: end,
    filters: {},
  });
  assert.equal(result.totals.repeated24h, 1);
  assert.equal(result.totals.repeated7d, 1);
  assert.equal(result.totals.repeated30d, 2);
  assert.equal(result.totals.maintenanceReturnCycles, 2);
  assert.equal(result.groups[0].averageRepeatGapHours, 209.5);
});

test("filtro de setor delimita coorte, mas mantém antecedente do mesmo ativo e diagnóstico", () => {
  const result = buildFailureIntelligence({
    calls: [
      call("prior", "2026-10-06T23:00:00Z", { subtype: "electrical" }),
      call("new", "2026-10-07T05:00:00Z", { subtype: "mechanical" }),
    ],
    start,
    effectiveEnd: end,
    filters: { subtype: "mechanical" },
  });
  assert.equal(result.totals.diagnosedFinishedCalls, 1);
  assert.equal(result.totals.repeated24h, 1);
});

test("instantes iguais, classes sem diagnóstico e antecedente antigo não contam", () => {
  const result = buildFailureIntelligence({
    calls: [
      call("too-old", "2026-09-01T00:00:00Z"),
      call("a", "2026-10-07T01:00:00Z"),
      call("b", "2026-10-07T01:00:00Z"),
      call("blank", "2026-10-07T02:00:00Z", {
        classification: " ",
      }),
    ],
    start,
    effectiveEnd: end,
    filters: {},
  });
  assert.equal(result.totals.diagnosedFinishedCalls, 2);
  assert.equal(result.totals.repeated30d, 0);
  assert.equal(result.coverage.withSetSnapshot, 2);
});

test("período futuro sem concluídos e conjunto ausente exibem cobertura nula", () => {
  const result = buildFailureIntelligence({
    calls: [],
    start: at("2026-10-07T00:00:00Z"),
    effectiveEnd: at("2026-10-07T00:00:00Z"),
    filters: {},
  });
  assert.equal(result.totals.diagnosedFinishedCalls, 0);
  assert.equal(result.totals.repeatRate30dPercent, null);
  assert.equal(result.coverage.withSetSnapshotPercent, null);
});
