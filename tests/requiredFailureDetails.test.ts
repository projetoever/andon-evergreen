import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findApplicableFailureEvent,
  isSpecificFailureClassification,
} from "../src/utils/failureEventUtils";
import { finishAndonCall, openAndonCall } from "../src/services/andonService";
import { extractFailureDescriptionForFinish } from "../src/utils/failureDescriptionUtils";
import type { Machine, MachineStopEvent } from "../src/types/machine";

function failureEvent(
  id: string,
  callId: string,
  stoppedAt: string,
  resumedAt: string | null,
): MachineStopEvent {
  return {
    id,
    callId,
    machineId: "machine-1",
    stoppedAt,
    resumedAt,
    durationMinutes: 0,
    source: "manual",
  };
}

function createMachine(id: string): Machine {
  const now = new Date().toISOString();
  return {
    id,
    name: "Máquina de detalhes obrigatórios",
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

function createFinishScenario(machineCondition: "running" | "stopped") {
  const opened = openAndonCall([createMachine(`machine-${machineCondition}`)], [], {
    machineId: `machine-${machineCondition}`,
    category: "production",
    subtype: `failure-${machineCondition}`,
    machineCondition,
  });

  return {
    machines: opened.machines,
    calls: opened.calls,
    params: {
      callId: opened.call.id,
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
    } satisfies Parameters<typeof finishAndonCall>[2],
  };
}

test("evento aberto prevalece e fallback usa o evento ligado mais recente", () => {
  const events = [
    failureEvent("closed-new", "call-1", "2026-09-22T10:00:00.000Z", "2026-09-22T10:05:00.000Z"),
    failureEvent("open-old", "call-1", "2026-09-22T09:00:00.000Z", null),
    failureEvent("other", "call-2", "2026-09-22T11:00:00.000Z", null),
  ];

  assert.equal(findApplicableFailureEvent(events, "call-1")?.id, "open-old");
  assert.equal(
    findApplicableFailureEvent(
      events.filter((event) => event.id !== "open-old"),
      "call-1",
    )?.id,
    "closed-new",
  );
  assert.equal(findApplicableFailureEvent(events, "call-without-event"), null);
});

test("placeholders não são classificações específicas e notas automáticas não viram descrição", () => {
  assert.equal(isSpecificFailureClassification("unclassified"), false);
  assert.equal(isSpecificFailureClassification("unidentified_stop"), false);
  assert.equal(isSpecificFailureClassification("real_machine_failure"), false);
  assert.equal(isSpecificFailureClassification("electrical_failure"), true);

  assert.equal(
    extractFailureDescriptionForFinish(
      "Falha registrada na abertura do ANDON\nContinuidade da falha: impacto transferido.",
    ),
    "",
  );
  assert.equal(
    extractFailureDescriptionForFinish(
      "Sensor indutivo sem resposta\nContinuidade da falha: impacto transferido.",
    ),
    "Sensor indutivo sem resposta",
  );
});

test("frontend exige classificação e descrição em todas as condições finais", async () => {
  const [modal, repository, configService] = await Promise.all([
    readFile(new URL("../src/components/calls/FinishCallModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/repositories/apiAndonRepository.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../src/services/failureClassificationConfigService.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(modal, /findApplicableFailureEvent\(machine\.stopHistory, call\.id\)/);
  assert.match(modal, /getFailureClassificationConfigs\(\)/);
  assert.match(modal, /activeFailureClassifications/);
  assert.match(modal, /preservesExistingInactiveClassification/);
  assert.match(modal, /const \[callDescription, setCallDescription\]/);
  assert.doesNotMatch(modal, /const \[notes, setNotes\]/);
  assert.doesNotMatch(modal, /const \[failureDescription, setFailureDescription\]/);
  assert.match(
    modal,
    /hasValidFailureClassification &&\s*callDescription\.trim\(\)\.length > 0/,
  );
  assert.match(modal, /Detalhes da falha/);
  assert.match(modal, /Descrição da falha/);
  assert.doesNotMatch(modal, /\{applicableFailureEvent && \(/);
  assert.doesNotMatch(modal, /Observações do atendimento/);
  assert.match(
    modal,
    /extractFailureDescriptionForFinish\([\s\S]*applicableFailureEvent\?\.failureDescription[\s\S]*\) \|\| extractFailureDescriptionForFinish\(call\.notes\)/,
  );
  assert.match(modal, /const normalizedDescription = callDescription\.trim\(\)/);
  assert.match(modal, /notes:\s*normalizedDescription \|\| null/);
  assert.match(
    modal,
    /failureDescription: normalizedDescription \|\| null/,
  );
  assert.match(repository, /failureClassification: params\.failureClassification/);
  assert.match(repository, /failureDescription: params\.failureDescription/);
  assert.doesNotMatch(configService, /localStorage|andonFailureClassificationConfig/);
});

test("backend e modo local validam detalhes e preservam descrição única", async () => {
  const [route, localService] = await Promise.all([
    readFile(new URL("../server/src/routes/andonCalls.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/services/andonService.ts", import.meta.url), "utf8"),
  ]);
  const transactionStart = route.indexOf("const updatedCall = await prisma.$transaction");
  const eventLookup = route.indexOf("const openFailureEvent", transactionStart);
  const eventUpdate = route.indexOf("await tx.failureEvent.update", eventLookup);
  const callUpdate = route.indexOf("await tx.andonCall.update", eventUpdate);

  assert.ok(transactionStart >= 0 && eventLookup > transactionStart);
  assert.ok(eventUpdate > eventLookup && callUpdate > eventUpdate);
  assert.match(route, /GENERIC_FAILURE_CLASSIFICATIONS/);
  assert.match(route, /tx\.failureClassification\.findUnique/);
  assert.match(route, /applicableFailureEvent\?\.classification !== catalogClassification\.value/);
  assert.match(
    route,
    /const resolvedFailureDescription =\s*optionalString\(body\.failureDescription\) \?\? optionalString\(body\.notes\)/,
  );
  assert.match(route, /if \(!resolvedFailureDescription\)/);
  assert.match(route, /if \(!applicableFailureEvent\) \{\s*await tx\.failureEvent\.create/);
  assert.match(route, /durationSeconds: 0/);
  assert.match(
    route,
    /const finalDescription =\s*optionalString\(body\.notes\) \?\? optionalString\(body\.failureDescription\)/,
  );
  assert.match(route, /notes: mergeFinalDescription\(call\.notes, finalDescription\)/);
  assert.doesNotMatch(
    route,
    /Falha encerrada automaticamente na finalização do chamado responsável/,
  );
  assert.doesNotMatch(
    route,
    /appendNote\(call\.notes, optionalString\(body\.notes\), "Finalização"\)/,
  );

  assert.match(localService, /findApplicableFailureEvent\(machine\.stopHistory, call\.id\)/);
  assert.match(localService, /if \(!normalizedDescription\)/);
  assert.match(localService, /notes: mergeFinalDescription\(call\.notes, normalizedDescription\)/);
  assert.match(localService, /failureDescription: normalizedDescription/);
});

test("modo local exige os dois detalhes com máquina parada e pronta para rodar", () => {
  for (const condition of ["stopped", "running"] as const) {
    const scenario = createFinishScenario(condition);
    assert.throws(
      () => finishAndonCall(scenario.machines, scenario.calls, scenario.params),
      /Classificação da falha é obrigatória/,
    );
    assert.throws(
      () => finishAndonCall(scenario.machines, scenario.calls, {
        ...scenario.params,
        failureClassification: "unclassified",
        failureDescription: "Falha identificada",
      }),
      /Selecione uma classificação específica da falha/,
    );
    assert.throws(
      () => finishAndonCall(scenario.machines, scenario.calls, {
        ...scenario.params,
        failureClassification: "quality_failure",
      }),
      /Descrição da falha é obrigatória/,
    );
    const result = finishAndonCall(scenario.machines, scenario.calls, {
      ...scenario.params,
      failureClassification: "quality_failure",
      failureDescription: "  Falha específica identificada  ",
    });
    assert.equal(result.calls[0].status, "finished");
    const event = findApplicableFailureEvent(result.machines[0].stopHistory, scenario.calls[0].id);
    assert.equal(event?.failureClassification, "quality_failure");
    assert.equal(event?.failureDescription, "Falha específica identificada");
    if (condition === "running") {
      assert.equal(event?.durationMinutes, 0);
      assert.equal(event?.stoppedAt, event?.resumedAt);
      assert.equal(result.machines[0].machineStatus, "running");
    }
  }
});

test("finalização preserva auditoria e evita duplicar a descrição no modo local", () => {
  const scenario = createFinishScenario("running");
  const auditNotes = [
    "Descrição inicial",
    "Conclusão da manutenção: Integração concluída",
    "Retorno à manutenção: Falha voltou a ocorrer",
  ].join("\n");
  const callWithAudit = { ...scenario.calls[0], notes: auditNotes };

  const withNewDescription = finishAndonCall(scenario.machines, [callWithAudit], {
    ...scenario.params,
    failureClassification: "quality_failure",
    notes: "  Finalização de integração  ",
  }).calls[0];
  assert.equal(withNewDescription.notes, `${auditNotes}\nFinalização de integração`);
  assert.doesNotMatch(withNewDescription.notes ?? "", /Finalização: Finalização de integração/);

  const existingDescription = `${auditNotes}\nFinalização de integração`;
  const withoutDuplication = finishAndonCall(
    scenario.machines,
    [{ ...callWithAudit, notes: existingDescription }],
    { ...scenario.params, failureClassification: "quality_failure", notes: "finalização   de integração" },
  ).calls[0];
  assert.equal(withoutDuplication.notes, existingDescription);
  assert.equal(withoutDuplication.notes?.match(/Finalização de integração/gi)?.length, 1);

  assert.throws(
    () => finishAndonCall(scenario.machines, [callWithAudit], {
      ...scenario.params,
      failureClassification: "quality_failure",
    }),
    /Descrição da falha é obrigatória/,
  );
});
