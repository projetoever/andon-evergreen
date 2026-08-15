import assert from "node:assert/strict";
import test from "node:test";

import { finishAndonCall, openAndonCall } from "../src/services/andonService";
import type { AndonCall } from "../src/types/andon";
import type { Machine } from "../src/types/machine";

function createMachine(): Machine {
  const now = new Date().toISOString();
  return {
    id: "machine-impact-test",
    name: "Máquina de impacto",
    machineStatus: "running",
    andonStatus: "none",
    currentCallId: null,
    lastStatusChangedAt: now,
    stoppedAt: null,
    lastStopDurationMinutes: 0,
    stopHistory: [],
    productionMode: "scheduled",
    productionModeChangedAt: now,
    productionHistory: [],
    useCommercialShift: false,
    isActive: true,
    displayOrder: null,
  };
}

function finishParams(call: AndonCall, extra: Partial<Parameters<typeof finishAndonCall>[2]> = {}) {
  return {
    callId: call.id,
    technicianName: null,
    technicianArea: null,
    confirmedMachineSetId: null,
    confirmedMachineSetCodeSnapshot: null,
    confirmedMachineSetNameSnapshot: null,
    confirmedMachineSetTypeSnapshot: null,
    confirmedMachineSubsetId: null,
    confirmedMachineSubsetCodeSnapshot: null,
    confirmedMachineSubsetNameSnapshot: null,
    confirmedMachineSubsetTypeSnapshot: null,
    ...extra,
  };
}

test("atribui impacto somente ao chamado que informou a parada e transfere sem retroagir", () => {
  let machines = [createMachine()];
  let calls: AndonCall[] = [];

  const electrical = openAndonCall(machines, calls, {
    machineId: machines[0].id,
    category: "production",
    subtype: "electrical-test",
    machineCondition: "running",
  });
  machines = electrical.machines;
  calls = electrical.calls;

  const mechanical = openAndonCall(machines, calls, {
    machineId: machines[0].id,
    category: "production",
    subtype: "mechanical-test",
    machineCondition: "stopped",
  });
  machines = mechanical.machines;
  calls = mechanical.calls;

  const hotMelt = openAndonCall(machines, calls, {
    machineId: machines[0].id,
    category: "production",
    subtype: "hot-melt-test",
    machineCondition: "running",
  });
  machines = hotMelt.machines;
  calls = hotMelt.calls;

  const quality = openAndonCall(machines, calls, {
    machineId: machines[0].id,
    category: "production",
    subtype: "quality-test",
    machineCondition: "running",
  });
  machines = quality.machines;
  calls = quality.calls;

  assert.equal(electrical.call.impactIntervals?.length, 0);
  assert.equal(mechanical.call.impactIntervals?.filter((interval) => !interval.endedAt).length, 1);
  assert.equal(hotMelt.call.impactIntervals?.length, 0);
  assert.equal(quality.call.impactIntervals?.length, 0);

  assert.throws(
    () => finishAndonCall(machines, calls, finishParams(mechanical.call)),
    /máquina continua em falha/i,
  );

  const physicalFailureStartedAt = machines[0].stopHistory[0].stoppedAt;
  const transferred = finishAndonCall(
    machines,
    calls,
    finishParams(mechanical.call, {
      machineStatus: "stopped",
      impactCallIds: [electrical.call.id, hotMelt.call.id],
    }),
  );

  const electricalAfterTransfer = transferred.calls.find((call) => call.id === electrical.call.id);
  const mechanicalAfterTransfer = transferred.calls.find((call) => call.id === mechanical.call.id);
  const hotMeltAfterTransfer = transferred.calls.find((call) => call.id === hotMelt.call.id);
  const qualityAfterTransfer = transferred.calls.find((call) => call.id === quality.call.id);

  assert.equal(transferred.machines[0].machineStatus, "stopped");
  assert.equal(transferred.machines[0].stopHistory[0].stoppedAt, physicalFailureStartedAt);
  assert.equal(transferred.machines[0].stopHistory[0].callId, electrical.call.id);
  assert.equal(
    electricalAfterTransfer?.impactIntervals?.filter((interval) => !interval.endedAt).length,
    1,
  );
  assert.equal(
    mechanicalAfterTransfer?.impactIntervals?.filter((interval) => !interval.endedAt).length,
    0,
  );
  assert.equal(
    hotMeltAfterTransfer?.impactIntervals?.filter((interval) => !interval.endedAt).length,
    1,
  );
  assert.equal(qualityAfterTransfer?.impactIntervals?.length, 0);
});
