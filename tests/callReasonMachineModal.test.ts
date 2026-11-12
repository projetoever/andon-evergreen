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
