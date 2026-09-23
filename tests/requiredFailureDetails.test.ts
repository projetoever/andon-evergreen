import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findApplicableFailureEvent,
  isSpecificFailureClassification,
} from "../src/utils/failureEventUtils";
import { extractFailureDescriptionForFinish } from "../src/utils/failureDescriptionUtils";
import type { MachineStopEvent } from "../src/types/machine";

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

test("frontend usa uma descrição única e exige texto somente para Outro", async () => {
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
    /failureClassification !== "other" \|\| callDescription\.trim\(\)\.length > 0/,
  );
  assert.match(modal, /Detalhes da falha/);
  assert.match(modal, /Descrição do chamado/);
  assert.doesNotMatch(modal, /Observações do atendimento/);
  assert.match(
    modal,
    /extractFailureDescriptionForFinish\([\s\S]*applicableFailureEvent\?\.failureDescription[\s\S]*\) \|\| extractFailureDescriptionForFinish\(call\.notes\)/,
  );
  assert.match(modal, /const normalizedDescription = callDescription\.trim\(\)/);
  assert.match(modal, /notes:\s*normalizedDescription \|\| null/);
  assert.match(
    modal,
    /failureDescription:\s*applicableFailureEvent\s*\? normalizedDescription \|\| null\s*: null/,
  );
  assert.match(repository, /failureClassification: params\.failureClassification/);
  assert.match(repository, /failureDescription: params\.failureDescription/);
  assert.doesNotMatch(configService, /localStorage|andonFailureClassificationConfig/);
});

test("backend e modo local preservam classificação e descrição única", async () => {
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
  assert.match(route, /applicableFailureEvent\.classification !== catalogClassification\.value/);
  assert.match(route, /failureClassification === "other" && !failureDescription/);
  assert.match(
    route,
    /Descrição do chamado é obrigatória quando a classificação é "Outro"/,
  );
  assert.doesNotMatch(route, /if \(!failureDescription\)/);
  assert.match(route, /notes: failureDescription \?\? applicableFailureEvent\.notes/);
  assert.match(route, /notes: optionalString\(body\.notes\) \?\? call\.notes/);
  assert.doesNotMatch(
    route,
    /appendNote\(call\.notes, optionalString\(body\.notes\), "Finalização"\)/,
  );

  assert.match(localService, /findApplicableFailureEvent\(machine\.stopHistory, call\.id\)/);
  assert.match(localService, /failureClassification === "other" && !normalizedDescription/);
  assert.match(localService, /notes: normalizedDescription \|\| call\.notes \|\| null/);
  assert.match(localService, /failureDescription: normalizedDescription/);
});
