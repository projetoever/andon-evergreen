import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { failureClassificationSchema } from "../src/services/backupSchema";
import type { MachineStopEvent } from "../src/types/machine";

test("classificação dinâmica e histórica permanece válida nos tipos e no backup", () => {
  const historicalValue = "legacy_customer_specific_failure";
  const event: MachineStopEvent = {
    id: "event-1",
    machineId: "machine-1",
    stoppedAt: "2026-09-21T12:00:00.000Z",
    resumedAt: "2026-09-21T12:01:00.000Z",
    durationMinutes: 1,
    source: "manual",
    failureClassification: historicalValue,
  };

  assert.equal(event.failureClassification, historicalValue);
  assert.equal(failureClassificationSchema.parse(historicalValue), historicalValue);
});

test("frontend usa a API central e não possui fallback silencioso no catálogo local", async () => {
  const [service, history, admin] = await Promise.all([
    readFile(
      new URL("../src/services/failureClassificationConfigService.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/pages/MachineFailureHistoryPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/settings/AdminSettingsModal.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(service, /localStorage|andonFailureClassificationConfig/);
  assert.doesNotMatch(service, /catch\s*\(/);
  assert.match(service, /apiClient\.get<FailureClassificationConfig\[\]>/);
  assert.match(service, /\?active=true/);
  assert.match(history, /catalogByValue\.get\(value\)/);
  assert.match(history, /option\.value/);
  assert.match(history, /Catálogo central de classificações indisponível/);
  assert.match(admin, /createFailureClassification/);
  assert.match(admin, /updateFailureClassification/);
  assert.match(admin, /Não foi possível carregar o catálogo central/);
});
