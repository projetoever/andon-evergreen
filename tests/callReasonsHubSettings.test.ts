import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const text = async (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("REFINE22 P1: motive hierarchy is nested in sectors and categories", async () => {
  const [nav, types] = await Promise.all([
    text("../src/components/settings/AdminSettingsModal.tsx"),
    text("../src/types/settings.ts"),
  ]);
  assert.match(nav, /id: "categories"/);
  assert.doesNotMatch(nav, /id: "callReasons",/);
  assert.match(nav, /catalogView === "sectors"/);
  assert.match(nav, /catalogView === "reasons"/);
  assert.match(nav, /<CategoriesSettingsTab \/>/);
  assert.match(nav, /capabilityTab/);
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

test("REFINE22 P1: reason editing exposes hierarchy order and existing area links", async () => {
  const [page, setup, api] = await Promise.all([
    text("../src/components/settings/CallReasonsSettingsTab.tsx"),
    text("../src/components/settings/AdminSettingsModal.tsx"),
    text("../server/src/security/centralCallReasonsHttp.ts"),
  ]);
  assert.match(setup, /catalogView === "reasons"/);
  assert.match(page, /createReasonDraft\(\)/);
  assert.match(page, /Math\.max\(0, \.\.\.reasons\.map\(reason => reason\.displayOrder\)\) \+ 10/);
  assert.match(page, /Ordem de exibição do motivo/);
  assert.match(page, /Number\.isSafeInteger\(next\.displayOrder\)/);
  assert.match(page, /next\.displayOrder > 9999/);
  assert.match(page, /Vincule setores já cadastrados como subcategorias deste motivo/);
  assert.match(page, /addCallReasonOption\(chosen\.id/);
  assert.match(page, /updateCallReasonOption\(chosen\.id, option\.id, option\.revision/);
  assert.match(page, /restrictedDelegatedLink/);
  assert.match(api, /assertPermission\(principal, "analytics\.policy\.manage"\)/);
});
