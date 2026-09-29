import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  finishAndonCall,
  openAndonCall,
  updateCallFailureDetails,
} from "../src/services/andonService";
import { getCallFailureDetails } from "../src/utils/callFailureDetailsUtils";
import type { Machine } from "../src/types/machine";

function machine(): Machine {
  const now = new Date().toISOString();
  return {
    id: "edit-machine",
    name: "Máquina",
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

function finish(
  machines: Machine[],
  calls: ReturnType<typeof openAndonCall>["calls"],
  callId: string,
) {
  return finishAndonCall(machines, calls, {
    callId,
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
    failureClassification: "quality_failure",
    failureDescription: "Diagnóstico original",
  });
}

test("chamado running atualiza diagnóstico sem fabricar parada ou impacto", () => {
  const opened = openAndonCall([machine()], [], {
    machineId: "edit-machine",
    category: "production",
    subtype: "quality",
    machineCondition: "running",
  });
  const finished = finish(opened.machines, opened.calls, opened.call.id);
  const before = finished.machines[0];
  const result = updateCallFailureDetails(finished.machines, finished.calls, {
    callId: opened.call.id,
    failureClassification: "electrical_failure",
    failureDescription: "  Sensor ajustado  ",
  });
  assert.equal(result.calls[0].failureClassification, "electrical_failure");
  assert.equal(result.calls[0].failureDescription, "Sensor ajustado");
  assert.deepEqual(result.machines[0], before);
  assert.deepEqual(result.calls[0].impactIntervals, finished.calls[0].impactIntervals);
  assert.equal(result.calls[0].machineStoppedMinutes, 0);
  assert.deepEqual(result.machines[0].stopHistory, []);
  assert.deepEqual(getCallFailureDetails(result.calls[0], []), {
    classification: "electrical_failure",
    description: "Sensor ajustado",
  });
});

test("parada real sincroniza somente o evento próprio e conserva os tempos físicos", () => {
  const opened = openAndonCall([machine()], [], {
    machineId: "edit-machine",
    category: "production",
    subtype: "mechanical",
    machineCondition: "stopped",
  });
  const finished = finish(opened.machines, opened.calls, opened.call.id);
  const before = finished.machines[0];
  const result = updateCallFailureDetails(finished.machines, finished.calls, {
    callId: opened.call.id,
    failureClassification: "electrical_failure",
    failureDescription: "Conector reparado",
  });
  assert.equal(result.machines[0].stopHistory.length, before.stopHistory.length);
  assert.equal(result.machines[0].stopHistory[0].id, before.stopHistory[0].id);
  assert.equal(result.machines[0].stopHistory[0].failureClassification, "electrical_failure");
  assert.equal(result.machines[0].stopHistory[0].failureDescription, "Conector reparado");
  assert.equal(result.machines[0].stopHistory[0].stoppedAt, before.stopHistory[0].stoppedAt);
  assert.equal(result.machines[0].stopHistory[0].resumedAt, before.stopHistory[0].resumedAt);
  assert.equal(
    result.machines[0].stopHistory[0].durationMinutes,
    before.stopHistory[0].durationMinutes,
  );
  assert.deepEqual(result.calls[0].impactIntervals, finished.calls[0].impactIntervals);
});

test("chamado B não assume nem modifica a parada pertencente a A", () => {
  const running = openAndonCall([machine()], [], {
    machineId: "edit-machine",
    category: "production",
    subtype: "quality",
    machineCondition: "running",
  });
  const stopped = openAndonCall(running.machines, running.calls, {
    machineId: "edit-machine",
    category: "production",
    subtype: "mechanical",
    machineCondition: "stopped",
  });
  const finishedB = finish(stopped.machines, stopped.calls, running.call.id);
  const before = finishedB.machines[0];
  const result = updateCallFailureDetails(finishedB.machines, finishedB.calls, {
    callId: running.call.id,
    failureClassification: "electrical_failure",
    failureDescription: "Apoio concluído",
  });
  assert.equal(
    result.calls.find((call) => call.id === running.call.id)?.failureDescription,
    "Apoio concluído",
  );
  assert.deepEqual(
    result.calls.find((call) => call.id === stopped.call.id),
    finishedB.calls.find((call) => call.id === stopped.call.id),
  );
  assert.deepEqual(result.machines[0], before);
  assert.equal(result.machines[0].stopHistory[0].callId, stopped.call.id);
  assert.equal(result.machines[0].machineStatus, "stopped");
});

test("rejeita descrição vazia, placeholders e chamados inelegíveis", () => {
  const opened = openAndonCall([machine()], [], {
    machineId: "edit-machine",
    category: "production",
    subtype: "quality",
    machineCondition: "running",
  });
  const input = {
    callId: opened.call.id,
    failureClassification: "quality_failure",
    failureDescription: "válida",
  };
  assert.throws(
    () => updateCallFailureDetails(opened.machines, opened.calls, input),
    /finalizados/,
  );
  const finished = finish(opened.machines, opened.calls, opened.call.id);
  assert.throws(
    () =>
      updateCallFailureDetails(finished.machines, finished.calls, {
        ...input,
        failureDescription: "  ",
      }),
    /Descrição da falha/,
  );
  for (const value of ["unclassified", "unidentified_stop", "real_machine_failure"]) {
    assert.throws(
      () =>
        updateCallFailureDetails(finished.machines, finished.calls, {
          ...input,
          failureClassification: value,
        }),
      /classificação específica/,
    );
  }
  assert.throws(
    () =>
      updateCallFailureDetails(
        finished.machines,
        [{ ...finished.calls[0], isSystemTest: true }],
        input,
      ),
    /finalizados/,
  );
  assert.throws(
    () =>
      updateCallFailureDetails(
        finished.machines,
        [{ ...finished.calls[0], status: "cancelled" }],
        input,
      ),
    /finalizados/,
  );
});

test("legado consulta evento vinculado e recebe backfill estruturado na edição", () => {
  const opened = openAndonCall([machine()], [], {
    machineId: "edit-machine",
    category: "production",
    subtype: "mechanical",
    machineCondition: "stopped",
  });
  const finished = finish(opened.machines, opened.calls, opened.call.id);
  const legacy = { ...finished.calls[0], failureClassification: null, failureDescription: null };
  assert.deepEqual(getCallFailureDetails(legacy, finished.machines[0].stopHistory), {
    classification: "quality_failure",
    description: "Diagnóstico original",
  });
  assert.deepEqual(getCallFailureDetails(legacy, []), { classification: null, description: null });
  const result = updateCallFailureDetails(finished.machines, [legacy], {
    callId: legacy.id,
    failureClassification: "electrical_failure",
    failureDescription: "Legado ajustado",
  });
  assert.equal(result.calls[0].failureDescription, "Legado ajustado");
  assert.equal(result.machines[0].stopHistory[0].failureDescription, "Legado ajustado");
});

test("histórico reserva diagnóstico ao CHAMADO e mantém edição das falhas órfãs", async () => {
  const source = await readFile(
    new URL("../src/pages/MachineCallHistoryPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /canEditDiagnosis = call.status === "finished" && !call.isSystemTest/);
  assert.match(source, /getCallFailureDetails\(call, linkedFailureEvents\)/);
  assert.match(source, /\{showFailureImpact && \(\s*<div>[\s\S]*?Classificação/);
  assert.match(source, /\{showFailureImpact && \(\s*<div className="sm:col-span-2 lg:col-span-3">/);
  assert.match(
    source,
    /linkedFailureEvents.map\(\(event\) => renderFailureEvent\(event, false\)\)/,
  );
  assert.match(source, /orphanFailureEvents.map\(\(event\) => renderFailureEvent\(event, true\)\)/);
  assert.match(source, /updateMachineStopEventDescription\(/);
});
