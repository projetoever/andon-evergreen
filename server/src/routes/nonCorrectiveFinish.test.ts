import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("S4-D server requires description, never forces corrective diagnosis for Setup/Apoio", async () => {
  const s = await readFile(new URL("./andonCalls.ts", import.meta.url), "utf8");
  assert.match(s, /openingReason\?\.nature === "planned_setup"/);
  assert.match(s, /openingReason\?\.nature === "production_support"/);
  assert.match(s, /Descrição do atendimento é obrigatória/);
  assert.match(s, /if \(failureClassification\)\s*throw new FinishCallValidationError\("Setup e Apoio não exigem classificação de falha"\)/);
  assert.match(s, /failureClassification: call\.isSystemTest \|\| isNonCorrectiveReason \? null : failureClassification/);
  assert.match(s, /if \(!failureClassification\)/);
});

test("S4-D finish modal shows service notes instead of failure for non-corrective reasons", async () => {
  const s = await readFile(new URL("../../../src/components/calls/FinishCallModal.tsx", import.meta.url), "utf8");
  assert.match(s, /const isServiceRequest = call\?\.callReasonSnapshot\?\.nature === "planned_setup"/);
  assert.match(s, /isServiceRequest \? ui\("Descrição do atendimento"\) : ui\("Detalhes da falha"\)/);
  assert.match(s, /!isServiceRequest && \(/);
  assert.match(s, /failureClassification: currentCall\.isSystemTest \|\| isServiceRequest/);
  assert.match(s, /callDescription\.trim\(\)\.length > 0/);
});
