import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("CFG-15B: shift metadata and technician filter respect independent central write gates", async () => {
  const [ui, settings, gate, routes, filter] = await Promise.all([
    source("../src/components/settings/ShiftsSettingsTab.tsx"),
    source("../server/src/services/systemSettings.ts"),
    source("../server/src/security/centralShiftSettingsHttp.ts"),
    source("../server/src/routes/shifts.ts"),
    source("../src/services/technicianShiftFilterService.ts"),
  ]);
  assert.match(ui, /useModuleAccess\(\)/);
  assert.match(ui, /access\?\.centralAccessEnabled === true/);
  assert.match(ui, /capabilities\.centralShiftUpdateEnabled === true/);
  assert.match(ui, /capabilities\.centralOperationalSettingsWriteEnabled === true/);
  assert.match(ui, /const canEditShift = !centralMode \|\| centralShiftWritable/);
  assert.match(ui, /const canEditFilter = !centralMode \|\| centralFilterWritable/);
  assert.match(ui, /if \(!draft \|\| !canEditShift \|\| isSaving\) return/);
  assert.match(ui, /if \(!canEditFilter \|\| isSavingFilter \|\| enabled === filterByCurrentShift\) return/);
  assert.match(ui, /disabled=\{!canEditShift\}/);
  assert.match(ui, /disabled=\{!hasUnsavedChanges \|\| isSaving \|\| !canEditShift\}/);
  assert.match(ui, /disabled=\{!canEditFilter \|\| isSavingFilter\}/);
  assert.match(ui, /setIsSavingFilter\(false\)/);
  assert.match(ui, /setFilterByCurrentShift\(saved\.filterByCurrentShift\)/);
  assert.match(settings, /centralShiftUpdateEnabled: centralShiftUpdateEnabled\(\)/);
  assert.match(settings, /centralOperationalSettingsWriteEnabled: centralOperationalSettingsEnabled\(\)/);
  assert.match(gate, /method === "PATCH"/);
  assert.match(routes, /isAuthorizedCentralShiftUpdate/);
  assert.match(filter, /updateSystemSettings\(\{/);
  assert.match(filter, /filterTechniciansByCurrentShift: config\.filterByCurrentShift/);
  assert.doesNotMatch(ui, /ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED\s*=\s*["']1/);
});

test("CFG-15B: local legacy mode remains writable while central feature flags fail closed", async () => {
  const ui = await source("../src/components/settings/ShiftsSettingsTab.tsx");
  assert.match(ui, /const canEditShift = !centralMode \|\| centralShiftWritable/);
  assert.match(ui, /const canEditFilter = !centralMode \|\| centralFilterWritable/);
  assert.match(ui, /setCentralShiftWritable\(capabilities\.centralShiftUpdateEnabled === true\)/);
  assert.match(ui, /setCentralFilterWritable\(capabilities\.centralOperationalSettingsWriteEnabled === true\)/);
  assert.match(ui, /saved\.filterByCurrentShift/);
  assert.match(ui, /centralMode && \(/);
});

test("CFG-15D2: asset catalogs and whole-set policy use independent central feature gates", async () => {
  const [panel, settings, catalogGuard] = await Promise.all([
    source("../src/components/settings/MachineAssetCatalogPanel.tsx"),
    source("../server/src/services/systemSettings.ts"),
    source("../server/src/security/centralAssetTypeCatalogHttp.ts"),
  ]);
  assert.ok(panel.includes("const centralMode = access?.centralAccessEnabled === true"));
  assert.ok(panel.includes("const canWriteCatalog = !centralMode || systemSettings?.centralAssetTypeCatalogWriteEnabled === true"));
  assert.ok(panel.includes("const canWritePolicy = !centralMode || systemSettings?.centralOperationalSettingsWriteEnabled === true"));
  assert.ok(panel.includes("setSystemSettings(null); // fail closed while refreshing capabilities"));
  assert.ok(panel.includes("if (!canWriteCatalog || isSaving || isLoading || Boolean(loadError)) return;"));
  assert.ok(panel.includes("if (!canWritePolicy || isLoadingPolicy || isSavingPolicy || !systemSettings) return;"));
  assert.ok(panel.includes("disabled={!systemSettings || isLoadingPolicy || isSavingPolicy || !canWritePolicy}"));
  assert.ok(panel.includes("disabled={isSaving || isLoading || Boolean(loadError) || !canWriteCatalog}"));
  assert.ok(panel.includes("disabled={isSaving || !canWriteCatalog}"));
  assert.ok(panel.includes("disabled={!canWriteCatalog || isSaving}"));
  assert.ok(panel.includes("if (centralMode || isSaving || isLoading || Boolean(loadError)) return;"));
  assert.ok(panel.includes("{!centralMode && ("));
  assert.ok(settings.includes("centralAssetTypeCatalogWriteEnabled: centralAssetTypeCatalogEnabled()"));
  assert.ok(settings.includes("centralOperationalSettingsWriteEnabled: centralOperationalSettingsEnabled()"));
  assert.ok(catalogGuard.includes('if (method === "POST" && COLLECTIONS.has(path))'));
  assert.ok(catalogGuard.includes('if (method !== "PATCH") return null'));
  assert.ok(catalogGuard.includes("Do not enable"));
});

test("CFG-15D: shift and technician-filter write capabilities revalidate without reloading drafts", async () => {
  const ui = await source("../src/components/settings/ShiftsSettingsTab.tsx");
  assert.match(ui, /SYSTEM_SETTINGS_CHANGED_EVENT/);
  assert.match(ui, /window\.addEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(ui, /window\.addEventListener\("focus", revalidate\)/);
  assert.match(ui, /window\.removeEventListener\(SYSTEM_SETTINGS_CHANGED_EVENT, revalidate\)/);
  assert.match(ui, /window\.removeEventListener\("focus", revalidate\)/);
  assert.match(ui, /const request = \+\+requestVersion/);
  assert.match(ui, /request !== requestVersion/);
  assert.match(ui, /setCentralShiftWritable\(false\)/);
  assert.match(ui, /setCentralFilterWritable\(false\)/);
  assert.match(ui, /capabilities\.centralShiftUpdateEnabled === true/);
  assert.match(ui, /capabilities\.centralOperationalSettingsWriteEnabled === true/);
  assert.doesNotMatch(ui, /event\.detail/);
  // Focus refresh must not refetch drafts, preventing loss of unsaved changes.
  assert.doesNotMatch(ui, /const revalidate = \(\) => \{[\s\S]*?refreshShiftConfigs\(/);
});
