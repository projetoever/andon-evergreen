import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const get = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("CFG-15A: all 11 ANDON admin tabs display backend-grounded central availability", async () => {
  const [notice, server, type, modal] = await Promise.all([
    get("../src/components/settings/CentralSettingsCapabilityNotice.tsx"),
    get("../server/src/services/systemSettings.ts"),
    get("../src/types/systemSettings.ts"),
    get("../src/components/settings/AdminSettingsModal.tsx"),
  ]);
  for (const tab of [
    "general", "appearance", "sounds", "attendance", "technicians",
    "shifts", "categories", "callReasons", "classifications",
    "assetCatalogs", "machines",
  ]) {
    assert.match(notice, new RegExp(`case "${tab}"`), `missing capability status: ${tab}`);
    assert.match(modal, new RegExp(`id: "${tab}"`), `missing admin tab: ${tab}`);
  }
  const capabilityMatrix = [
    ["centralCategorySettingsWriteEnabled", "centralCategorySettingsEnabled"],
    ["centralShiftUpdateEnabled", "centralShiftUpdateEnabled"],
    ["centralClassificationWriteEnabled", "centralClassificationHttpEnabled"],
    ["centralAssetTypeCatalogWriteEnabled", "centralAssetTypeCatalogEnabled"],
    ["centralTechnicianCreateEnabled", "centralTechnicianCreateEnabled"],
    ["centralTechnicianUpdateEnabled", "centralTechnicianUpdateEnabled"],
    ["centralMachineCreateEnabled", "centralMachineCreateEnabled"],
    ["centralMachineSettingsWriteEnabled", "centralMachineSettingsEnabled"],
  ];
  for (const [capability, gate] of capabilityMatrix) {
    assert.match(type, new RegExp(`\\b${capability}\\?: boolean`));
    assert.match(server, new RegExp(`\\b${capability}: ${gate}\\(\\)`));
    assert.match(notice, new RegExp(`settings\\.${capability}`));
  }
  assert.match(notice, /disponibilidade não verificada|Disponibilidade não verificada|status: "unverified"/i);
  assert.match(notice, /Credenciais e atendimento possuem proteções independentes/);
  assert.match(notice, /Estado operacional, produção e controle físico permanecem protegidos/);
  assert.match(notice, /Remoção de setores não é permitida pelo acesso central/);
});

test("CFG-15A: central sector actions fail closed on write flag and forbid DELETE", async () => {
  const [tab, guard, route] = await Promise.all([
    get("../src/components/settings/CategoriesSettingsTab.tsx"),
    get("../server/src/security/centralCategorySettingsHttp.ts"),
    get("../server/src/routes/andonCategories.ts"),
  ]);
  assert.match(tab, /useModuleAccess\\(\\)/);
  assert.match(tab, /centralAccessEnabled === true/);
  assert.match(tab, /centralCategorySettingsWriteEnabled === true/);
  assert.match(tab, /const canChangeCatalog = !centralMode \\|\\| centralCatalogWritable/);
  assert.match(tab, /if \\(isBusy \\|\\| !canChangeCatalog\\) return/);
  assert.match(tab, /if \\(centralMode \\|\\| !selectedId \\|\\| isBusy\\) return/);
  assert.match(tab, /disabled=\\{!selectedId \\|\\| isBusy \\|\\| centralMode\\}/);
  assert.match(tab, /disabled=\\{isBusy \\|\\| !canChangeCatalog\\}/);
  assert.match(tab, /disabled=\\{isBusy \\|\\| isLoading \\|\\| Boolean\\(loadError\\) \\|\\| !canChangeCatalog\\}/);
  assert.match(tab, /setCentralCatalogWritable\\(false\\)/);
  assert.match(guard, /method === "POST"/);
  assert.match(guard, /method === "PATCH"/);
  assert.doesNotMatch(guard, /method === "DELETE"/);
  assert.match(route, /isAuthorizedCentralCategorySettings/);
  // No new DELETE central flag or privilege may be inferred by this UI change.
  assert.doesNotMatch(tab, /ANDON_CENTRAL_CATEGORY_DELETE/);
});
