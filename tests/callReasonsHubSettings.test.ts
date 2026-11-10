import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("S3-A: Hub exposes motive hierarchy as a dedicated administrative tab", async () => {
  const [nav, types] = await Promise.all([
    text("../src/components/settings/AdminSettingsModal.tsx"),
    text("../src/types/settings.ts"),
  ]);
  assert.match(nav, /id: "callReasons"/);
  assert.match(nav, /<CallReasonsSettingsTab\s*\/>/);
  assert.match(types, /\| "callReasons"/);
});

test("S3-A: changes never activate opening calls, write BI or bypass feature gate", async () => {
  const [panel, service, backend] = await Promise.all([
    text("../src/components/settings/CallReasonsSettingsTab.tsx"),
    text("../src/services/callReasonsCatalogService.ts"),
    text("../server/src/services/systemSettings.ts"),
  ]);
  assert.match(panel, /centralCallReasonsCatalogEnabled === true/);
  assert.match(panel, /!enabled/);
  assert.match(panel, /expectedRevision/).notEqual?.(undefined);
  assert.match(service, /expectedRevision: revision/);
  assert.match(backend, /centralCallReasonsHttpEnabled\(\)/);
  assert.doesNotMatch(panel, /openCall\(/);
  assert.doesNotMatch(service, /analytics\/maintenance|analytics\/reliability/);
});

test("S3-A: KPI eligibility remains visible but is not silently promoted by UI", async () => {
  const panel = await text("../src/components/settings/CallReasonsSettingsTab.tsx");
  assert.match(panel, /draft\.nature === "corrective_failure"/);
  assert.match(panel, /option\.effectivePolicy\.correctiveCandidate/);
  assert.match(panel, /chosen && chosen\.nature === draft\.nature/);
});
