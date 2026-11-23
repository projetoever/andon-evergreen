import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { translateLabel } from "../src/i18n/translate";
const src = (p: string) => readFile(new URL(`../src/${p}`, import.meta.url), "utf8");

test("PENTE 3-C: pending filters are visible and export still uses applied parameters", async () => {
  const page = await src("pages/GlobalCallHistoryPage.tsx");
  assert.match(page, /const filtersPending = JSON\.stringify\(draft\) !== JSON\.stringify\(applied\)/);
  assert.match(page, /\{filtersPending && \(/);
  assert.match(page, /Há filtros não aplicados/);
  assert.match(page, /getAuditedGlobalHistoryExport\(requested\)/);
  assert.match(page, /machineId: machineContextLocked \? requestedMachineId : applied\.machineId/);
  assert.match(page, /downloadGlobalHistoryPageCsv\(result\.items\)/);
  assert.match(page, /call\.failureClassification \|\| ui\("Sem classificação"\)/);
  assert.match(page, /const reset = \(\) => \{/);
});

test("PENTE 3-C: unsaved filter hint is translated in PT/EN/zh-TW", () => {
  const key = "Há filtros não aplicados. Clique em Filtrar para atualizar resultados e exportações.";
  for (const language of ["en", "zh-TW"] as const) {
    assert.notEqual(translateLabel(language, key), key);
  }
});
