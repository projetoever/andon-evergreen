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
  assert.match(tab, /useModuleAccess\(\)/);
  assert.match(tab, /centralAccessEnabled === true/);
  assert.match(tab, /centralCategorySettingsWriteEnabled === true/);
  assert.match(tab, /const canChangeCatalog = !centralMode \|\| centralCatalogWritable/);
  assert.match(tab, /if \(isBusy \|\| !canChangeCatalog\) return/);
  assert.match(tab, /if \(centralMode \|\| !selectedId \|\| isBusy\) return/);
  assert.match(tab, /disabled=\{!selectedId \|\| isBusy \|\| centralMode\}/);
  assert.match(tab, /disabled=\{isBusy \|\| !canChangeCatalog\}/);
  assert.match(tab, /disabled=\{isBusy \|\| isLoading \|\| Boolean\(loadError\) \|\| !canChangeCatalog\}/);
  assert.match(tab, /setCentralCatalogWritable\(false\)/);
  assert.match(guard, /method === "POST"/);
  assert.match(guard, /method === "PATCH"/);
  assert.doesNotMatch(guard, /method === "DELETE"/);
  assert.match(route, /isAuthorizedCentralCategorySettings/);
  // No new DELETE central flag or privilege may be inferred by this UI change.
  assert.doesNotMatch(tab, /ANDON_CENTRAL_CATEGORY_DELETE/);
});

test("CFG-15D3B: Machine Admin separates central machine creation from metadata edits", async () => {
  const [panel, settings, createGate, metadataGate, metadataService] = await Promise.all([
    get("../src/components/settings/MachineAdminPanel.tsx"),
    get("../server/src/services/systemSettings.ts"),
    get("../server/src/security/centralMachineCreateHttp.ts"),
    get("../server/src/security/centralMachineSettingsHttp.ts"),
    get("../server/src/access/centralMachineSettings.ts"),
  ]);
  assert.ok(panel.includes('settings.centralMachineCreateEnabled === true'));
  assert.ok(panel.includes('settings.centralMachineSettingsWriteEnabled === true'));
  assert.ok(panel.includes('const canCreateMachine = !centralAccess || centralCapabilities?.create === true'));
  assert.ok(panel.includes('const canEditMachineMetadata = !centralAccess || centralCapabilities?.update === true'));
  assert.ok(panel.includes('if (centralAccess) setCentralCapabilities(null); // fail closed during reload'));
  assert.ok(panel.includes('setCapabilityError(true)'));
  assert.ok(panel.includes('setCapabilityRetry(value => value + 1)'));
  assert.ok(panel.includes('if (!canCreateMachine) return;'));
  assert.ok(panel.includes('disabled={!canCreateMachine}'));
  assert.ok(panel.includes('disabled={!newId.trim() || !canCreateMachine}'));
  assert.ok(panel.includes('disabled={!canEditMachineMetadata}'));
  assert.ok(panel.includes('if (!canEditMachineMetadata) return;'));
  assert.ok(panel.includes('if (centralAccess) return;'));
  assert.ok(panel.includes('<SelectTrigger disabled={centralAccess}>'));
  assert.ok(panel.includes('disabled={centralAccess || Boolean(selectedMachine.currentCallId)}'));
  assert.ok(panel.includes('updateMachineCatalog(selectedMachine.id, {'));
  assert.ok(panel.includes('updateMachineProductionMode(selectedMachine.id, value as ProductionMode)'));
  assert.ok(settings.includes('centralMachineCreateEnabled: centralMachineCreateEnabled()'));
  assert.ok(settings.includes('centralMachineSettingsWriteEnabled: centralMachineSettingsEnabled()'));
  assert.ok(createGate.includes('method === "POST"'));
  assert.ok(metadataGate.includes('method === "PATCH"'));
  assert.ok(metadataService.includes('key !== "name" && key !== "requireWorkOrderAtOpen"'));
  assert.ok(!panel.includes("ANDON_CENTRAL_MACHINE_CREATE_HTTP_ENABLED"));
  assert.ok(!panel.includes("ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED"));
});


test("CFG-15B: all 11 tabs revalidate backend capabilities after navigation/settings changes/focus", async () => {
  const notice = await get("../src/components/settings/CentralSettingsCapabilityNotice.tsx");
  assert.match(notice, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(notice, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(notice, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(notice, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(notice, /\[open, tab, refreshVersion\]/);
  assert.match(notice, /getSystemSettings\(\)\.then/);
  assert.match(notice, /setSettings\(null\)/);
  assert.match(notice, /setLoadFailed\(true\)/);
  assert.match(notice, /setRefreshVersion\(version => version \+ 1\)/);
  assert.match(notice, /Tentar novamente/);
  assert.doesNotMatch(notice, /event\.detail\.(central|andon)/,
    "untrusted browser events must never grant a capability");
});

test("CFG-15C: sectors re-check their OWN write gate after server settings changes and focus", async () => {
  const tab = await get("../src/components/settings/CategoriesSettingsTab.tsx");
  assert.match(tab, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(tab, /window\.addEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(tab, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(tab, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(tab, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(tab, /const request = \+\+requestVersion/);
  assert.match(tab, /mounted && request === requestVersion/);
  assert.match(tab, /setCentralCatalogWritable\(false\)/);
  assert.match(tab, /settings\.centralCategorySettingsWriteEnabled === true/);
  assert.doesNotMatch(tab, /event\.detail/);
});

test("CFG-15E: technicians revalidate central create/update gates while preserving unsaved drafts", async () => {
  const tab = await get("../src/components/settings/TechniciansSettingsTab.tsx");
  assert.match(tab, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(tab, /window\.addEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(tab, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(tab, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(tab, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(tab, /const request = \+\+requestVersion/);
  assert.match(tab, /request !== requestVersion/);
  assert.match(tab, /setCentralCapabilities\(null\)/);
  assert.match(tab, /settings\.centralTechnicianCreateEnabled === true/);
  assert.match(tab, /settings\.centralTechnicianUpdateEnabled === true/);
  assert.match(tab, /\[centralMode, capabilityReload\]/);
  assert.doesNotMatch(tab, /event\.detail/);
  // Capability refresh deliberately does not change selected technician data.
  const revalidate = tab.slice(tab.indexOf("const revalidate = () =>"), tab.indexOf("  }, [centralMode, capabilityReload]);"));
  assert.doesNotMatch(revalidate, /setDraft|setSelectedId|refreshTechnicians/);
});
