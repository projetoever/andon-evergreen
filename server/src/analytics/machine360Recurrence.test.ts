import assert from "node:assert/strict";
import test from "node:test";
import { buildMachine360Recurrence, type MachineRecurrenceCall } from "./machine360Recurrence.js";

const at = (date: string) => new Date(date);
const start = at("2026-10-07T00:00:00Z");
const end = at("2026-10-08T00:00:00Z");
function call(id: string, time: string, overrides: Partial<MachineRecurrenceCall> = {}): MachineRecurrenceCall {
  return {
    id,
    subtype: "mechanical",
    finishedAt: at(time),
    classification: "sensor",
    workOrderNumber: "OS-900",
    description: "Sensor intermitente",
    maintenanceReturnCount: 0,
    isSystemTest: false,
    machineSetId: "set-a",
    machineSetNameSnapshot: "Esteira",
    machineSubsetId: "sub-a",
    machineSubsetNameSnapshot: "Sensor indutivo",
    confirmedMachineSetId: null,
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSubsetId: null,
    confirmedMachineSubsetNameSnapshot: null,
    ...overrides,
  };
}
function run(calls: MachineRecurrenceCall[], options: { subtype?: string; classification?: string } = {}) {
  return buildMachine360Recurrence({ calls, start, effectiveEnd: end, ...options });
}

test("inclui antecedente anterior ao recorte e contabiliza diagnóstico, conjunto e subconjunto", () => {
  const x = run([
    call("prior", "2026-10-06T22:00:00Z"),
    call("new", "2026-10-07T01:00:00Z", { maintenanceReturnCount: 2 }),
  ]);
  assert.equal(x.totals.diagnosedFinishedCalls, 1);
  assert.equal(x.totals.repeated24h, 1);
  assert.equal(x.totals.repeatedSet30d, 1);
  assert.equal(x.totals.repeatedSubset30d, 1);
  assert.equal(x.totals.maintenanceReturnCycles, 2);
  assert.equal(x.timeline[0].previousDiagnosisHours, 3);
  assert.equal(x.timeline[0].previousSubsetHours, 3);
});

test("setor filtra somente coorte; nomes e identidades confirmados preferem abertura", () => {
  const x = run([
    call("prior", "2026-10-06T23:00:00Z", { subtype: "electrical", confirmedMachineSetId: "set-ok", confirmedMachineSetNameSnapshot: "Conjunto A", confirmedMachineSubsetId: "sub-ok", confirmedMachineSubsetNameSnapshot: "Sensor A" }),
    call("new", "2026-10-07T02:00:00Z", { confirmedMachineSetId: "set-ok", confirmedMachineSetNameSnapshot: "Conjunto A", confirmedMachineSubsetId: "sub-ok", confirmedMachineSubsetNameSnapshot: "Sensor A" }),
  ], { subtype: "mechanical" });
  assert.equal(x.totals.repeatedSubset30d, 1);
  assert.equal(x.timeline[0].setName, "Conjunto A");
  assert.equal(x.timeline[0].subsetName, "Sensor A");
});

test("repetir diagnóstico em outro subconjunto não significa reincidência naquele subconjunto", () => {
  const x = run([
    call("prior", "2026-10-06T22:00:00Z"),
    call("new", "2026-10-07T03:00:00Z", {
      machineSubsetId: "sub-b", machineSubsetNameSnapshot: "Motor",
    }),
  ]);
  assert.equal(x.totals.repeated30d, 1);
  assert.equal(x.totals.repeatedSet30d, 1);
  assert.equal(x.totals.repeatedSubset30d, 0);
});

test("local não informado não vira falsa reincidência e não conta cobertura", () => {
  const unknown = {
    machineSetId: null, machineSetNameSnapshot: null,
    machineSubsetId: null, machineSubsetNameSnapshot: null,
  };
  const x = run([
    call("prior", "2026-10-06T22:00:00Z", unknown),
    call("new", "2026-10-07T03:00:00Z", unknown),
  ]);
  assert.equal(x.totals.repeated30d, 1);
  assert.equal(x.totals.repeatedSet30d, 0);
  assert.equal(x.totals.repeatedSubset30d, 0);
  assert.equal(x.totals.withSetSnapshot, 0);
});

test("não confunde horários iguais, testes ou classificação ausente com reincidência", () => {
  const x = run([
    call("prior", "2026-10-07T01:00:00Z"),
    call("same-time", "2026-10-07T01:00:00Z"),
    call("test", "2026-10-07T02:00:00Z", { isSystemTest: true }),
    call("unclassified", "2026-10-07T03:00:00Z", { classification: null }),
  ]);
  assert.equal(x.totals.diagnosedFinishedCalls, 2);
  assert.equal(x.totals.repeated24h, 0);
});

test("classifica janelas cumulativas e mantém chamadas distintas dos ciclos de retorno", () => {
  const x = run([
    call("old", "2026-10-01T00:00:00Z"),
    call("current", "2026-10-07T02:00:00Z", { maintenanceReturnCount: 4 }),
    call("close", "2026-10-07T03:00:00Z"),
  ]);
  assert.equal(x.totals.repeated24h, 1);
  assert.equal(x.totals.repeated7d, 2);
  assert.equal(x.totals.repeated30d, 2);
  assert.equal(x.totals.maintenanceReturnCycles, 4);
  assert.equal(x.totalTimelineCases, 2);
});
