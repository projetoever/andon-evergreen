import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("S3-B3B: machine screen shows parent reasons, then option modal and scoped single opening", async () => {
  const [page, panel, quick] = await Promise.all([
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/machines/MachineActionPanel.tsx"),
    read("../src/components/calls/QuickOpenCallModal.tsx"),
  ]);
  assert.match(page, /getOperationalCallReasons\(/);
  assert.match(page, /<CallReasonOptionsModal/);
  assert.match(page, /handleSelectReasonOption/);
  assert.match(page, /existing = activeCalls\.find/);
  assert.match(page, /setSelectedCallId\(existing\.id\)/);
  assert.match(page, /onOpenReason=/);
  assert.match(page, /hierarchicalChoice=\{hierarchicalChoice\}/);
  assert.match(panel, /hierarchicalReasons !== null/);
  assert.match(panel, /hierarchicalReasons\.map/);
  assert.match(panel, /activeCalls\.some/);
  assert.match(quick, /\.\.\.\(hierarchicalChoice/);
  assert.match(quick, /await openCall\(/);
  assert.doesNotMatch(quick, /await openCalls\(\[params\]\)/);
});

test("S3-B3B: frontend preserves backend expected revisions and legacy fields", async () => {
  const [page, modal, type] = await Promise.all([
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/calls/QuickOpenCallModal.tsx"),
    read("../src/services/andonService.ts"),
  ]);
  for (const key of ["expectedReasonRevision", "expectedOptionRevision", "reasonId", "optionId"]) {
    assert.ok(page.includes(key));
    assert.ok(modal.includes(key));
    assert.ok(type.includes(key));
  }
  assert.match(page, /option\.legacySubtype/);
  assert.match(page, /option\.legacyCategory/);
});


test("REFINE19: operator can distinguish an active sector call from a new opening in the modal", async () => {
  const [page, options, admin] = await Promise.all([
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/calls/CallReasonOptionsModal.tsx"),
    read("../src/components/settings/CallReasonsSettingsTab.tsx"),
  ]);
  assert.match(page, /activeSubtypes=\{activeCalls\.map\(call => call\.subtype\)\}/);
  assert.match(page, /existing = activeCalls\.find\(call => call\.subtype === option\.legacySubtype\)/);
  assert.match(page, /setSelectedCallId\(existing\.id\)/);
  assert.match(options, /activeSubtypes\.includes\(option\.legacySubtype\)/);
  assert.match(options, /Chamado já aberto/);
  assert.match(options, /Selecionar chamado existente/);
  assert.match(options, /w-\[calc\(100vw_-_1rem\)\]/);
  assert.match(options, /aria-pressed=\{selectedOptionId === option\.id\}/);
  assert.match(options, /onSelect\(reason\.id, selected\.id\)/);
  assert.match(admin, /abertura hierárquica está habilitada/);
  assert.doesNotMatch(admin, /Este cadastro ainda não altera os botões operacionais/);
});
