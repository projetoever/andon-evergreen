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
