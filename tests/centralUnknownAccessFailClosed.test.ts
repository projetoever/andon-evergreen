import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("CFG-15L: four ANDON tabs never infer legacy write permission from missing Hub access", async () => {
  const [shifts, sectors, technicians, assets] = await Promise.all([
    source("../src/components/settings/ShiftsSettingsTab.tsx"),
    source("../src/components/settings/CategoriesSettingsTab.tsx"),
    source("../src/components/settings/TechniciansSettingsTab.tsx"),
    source("../src/components/settings/MachineAssetCatalogPanel.tsx"),
  ]);

  const expected: ReadonlyArray<[string, string, readonly string[]]> = [
    ["Turnos", shifts, [
      "const canEditShift = access !== null && (!centralMode || centralShiftWritable)",
      "const canEditFilter = access !== null && (!centralMode || centralFilterWritable)",
      "if (!draft || !canEditShift || isSaving) return",
      "if (!canEditFilter || isSavingFilter || enabled === filterByCurrentShift) return",
    ]],
    ["Setores", sectors, [
      "const canChangeCatalog = access !== null && (!centralMode || centralCatalogWritable)",
      "if (access === null || centralMode || !selectedId || isBusy) return",
      "disabled={!selectedId || isBusy || access === null || centralMode}",
      "disabled={isBusy || !canChangeCatalog}",
    ]],
    ["Mantenedores", technicians, [
      "const canCreateTechnician = access !== null && (!centralMode || centralCapabilities?.create === true)",
      "const canUpdateTechnician = access !== null && (!centralMode || centralCapabilities?.update === true)",
      "if (!canCreateTechnician || isSaving) return",
      "disabled={isLoading || Boolean(error) || isSaving || !canCreateTechnician}",
    ]],
    ["Catálogos de ativos", assets, [
      "const canWriteCatalog = access !== null && (!centralMode || centralCapabilities?.catalog === true)",
      "const canWritePolicy = access !== null && (!centralMode || centralCapabilities?.policy === true)",
      "if (access === null || centralMode || isSaving || isLoading || Boolean(loadError)) return",
      "{access !== null && !centralMode && (",
      "if (!canWritePolicy || isLoadingPolicy || isSavingPolicy || !systemSettings) return",
    ]],
  ];
  for (const [name, content, fragments] of expected)
    for (const fragment of fragments)
      assert.ok(content.includes(fragment), name + ": missing " + fragment);

  // Existing capability revalidation, permission checks and unsaved drafts
  // are retained. The new guard must NOT bypass API authorization.
  for (const [name, content] of expected) {
    assert.match(content, /useModuleAccess\(\)/, name);
    assert.match(content, /access\?\.centralAccessEnabled === true/, name);
    assert.doesNotMatch(content, /access\?\.centralAccessEnabled !== true/, name);
    assert.match(content, /SYSTEM_SETTINGS_CHANGED_EVENT/, name);
    assert.match(content, /window\.addEventListener\("focus", revalidate\)/, name);
    assert.match(content, /window\.removeEventListener\("focus", revalidate\)/, name);
  }
  assert.match(shifts, /setCentralShiftWritable\(false\)/);
  assert.match(sectors, /setCentralCatalogWritable\(false\)/);
  assert.match(technicians, /setCentralCapabilities\(null\)/);
  assert.match(assets, /setSystemSettings\(null\)/);
  assert.match(assets, /setCentralCapabilities\(null\)/);
  assert.match(assets, /request !== requestVersion/);
  const capabilityOnly = assets.slice(assets.indexOf("const revalidate = () =>"), assets.indexOf("  }, [centralMode]);"));
  assert.doesNotMatch(capabilityOnly, /setNewForm|setEditForm|setEditingId|setSystemSettings\(/);
});

test("CFG-15L: an unresolved Hub response is denied regardless of server flags", () => {
  const check = (access: null | { centralAccessEnabled?: boolean }, capability: boolean) =>
    access !== null && (access.centralAccessEnabled !== true || capability);
  assert.equal(check(null, true), false);
  assert.equal(check(null, false), false);
  assert.equal(check({ centralAccessEnabled: true }, false), false);
  assert.equal(check({ centralAccessEnabled: true }, true), true);
  assert.equal(check({ centralAccessEnabled: false }, false), true);
  assert.equal(check({ centralAccessEnabled: false }, true), true);
});


test("CFG-15L: reasons/subcategories cannot write on a cached flag without confirmed Hub identity", async () => {
  const tab = await source("../src/components/settings/CallReasonsSettingsTab.tsx");
  assert.match(tab, /const \{ access \} = useModuleAccess\(\)/);
  assert.match(tab, /const writeBlocked = access === null \|\| busy \|\| capabilityChecking \|\| !enabled \|\| Boolean\(error\) \|\| loading/);
  assert.match(tab, /if \(writeBlocked\) return/);
  assert.match(tab, /if \(!chosen \|\| !areaToAdd \|\| busy \|\| restrictedDelegatedLink \|\| writeBlocked\) return/);
  assert.match(tab, /if \(!chosen \|\| writeBlocked \|\| editingOptionId !== option\.id\) return/);
  assert.match(tab, /setCapabilityChecking\(true\)/);
  assert.match(tab, /setEnabled\(false\)/);
  assert.match(tab, /SYSTEM_SETTINGS_CHANGED_EVENT/);
});
