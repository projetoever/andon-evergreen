import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { translateLabel } from "../src/i18n/translate";

const src = (file: string) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8");

test("PENTE 3-B: filters remain usable and may be collapsed by keyboard or touch", async () => {
  const page = await src("pages/GlobalCallHistoryPage.tsx");
  assert.match(page, /\[filtersExpanded, setFiltersExpanded\] = useState\(true\)/);
  assert.match(page, /aria-expanded=\{filtersExpanded\}/);
  assert.match(page, /aria-controls="global-history-filters"/);
  assert.match(page, /id="global-history-filters"/);
  assert.match(page, /className=\{filtersExpanded \? "lg:max-h-\[min\(43dvh,450px\)\] lg:overflow-y-auto lg:pr-1" : "hidden"\}/);
  assert.match(page, /<form onSubmit=\{submit\}/);
  assert.match(page, /setApplied\(next\)/);
  assert.match(page, /machineContextLocked \? \(/);
});

test("PENTE 3-B: authorized call card shows criticality, origin, technicians and full ID", async () => {
  const page = await src("pages/GlobalCallHistoryPage.tsx");
  assert.match(page, /aria-pressed=\{selectedId===call\.id\}/);
  assert.match(page, /CRITICALITY_LABELS\[call\.criticality\]/);
  assert.match(page, /call\.isSystemTest \? ui\("Teste do sistema"\) : ui\("Chamado real"\)/);
  assert.match(page, /call\.technicianNames\?\.join/);
  assert.match(page, /title=\{call\.id\}/);
  assert.match(page, /getGlobalHistoryCallDetail\(selectedId\)/);
  assert.match(page, /result\?\.items\.some\(item => item\.id === selectedId\)/);
});

test("PENTE 3-B: new labels exist in all three supported languages", () => {
  for (const key of ["Mostrar filtros", "Ocultar filtros", "Sem mantenedor"])
    for (const locale of ["en", "zh-TW"] as const)
      assert.notEqual(translateLabel(locale, key), key);
});

test("PENTE 3-B: layout does not replace authorized search, scoped summary or CSV flows", async () => {
  const page = await src("pages/GlobalCallHistoryPage.tsx");
  assert.match(page, /searchGlobalHistory\(applied, offset\)/);
  assert.match(page, /getGlobalHistorySummary\(applied\)/);
  assert.match(page, /getAuditedGlobalHistoryExport\(requested\)/);
  assert.match(page, /downloadGlobalHistoryPageCsv\(result\.items\)/);
  assert.match(page, /machineId: machineContextLocked \? requestedMachineId : draft\.machineId/);
  assert.match(page, /<GlobalHistoryDetailSections call=\{detail\}\s*\/>/);
});
