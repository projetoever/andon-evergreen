import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isDirectSectorButtonEnabled, isMachineDirectSectorButtonEnabled } from "../src/utils/sectorDirectVisibility";
import { deriveMachineSectorTiles } from "../src/utils/deriveMachineSectorTiles";
import type { AndonCategoryConfig } from "../src/types/settings";
import type { AndonCall } from "../src/types/andon";
import { resolveReasonOption } from "../server/src/services/callReasons";

const category = (active: boolean, showDirectButton?: boolean): AndonCategoryConfig => ({
  id: "pneumatica", displayName: "Pneumática", color: "#FFEDE4",
  categoryGroup: "maintenance", active, showDirectButton, displayOrder: 60,
});
const call = (status: string, id = "ch-1"): AndonCall =>
  ({ id, machineId: "M37", subtype: "pneumatica", status, isSystemTest: false } as AndonCall);

test("RC P0: hidden direct button and sector activation are independent (default visible)", () => {
  assert.equal(isDirectSectorButtonEnabled(category(true)), true);
  assert.equal(isDirectSectorButtonEnabled(category(true, true)), true);
  assert.equal(isDirectSectorButtonEnabled(category(true, false)), false);
  assert.equal(isDirectSectorButtonEnabled(category(false, true)), false);
  assert.equal(isDirectSectorButtonEnabled(category(false, false)), false);
});

test("RC P0: Pneumática remains openable through TESTE group when direct button is hidden", () => {
  const area = category(true, false);
  assert.equal(isDirectSectorButtonEnabled(area), false);
  const reason = {
    id: "teste", displayName: "TESTE", active: true, revision: 1,
    nature: "planned_setup", suggestedResponsibility: "unassigned",
    maintenanceKpiPolicy: "excluded", analyticsDisposition: "test",
  };
  const option = {
    id: "teste_pneumatica", reasonId: "teste", technicalAreaId: "pneumatica",
    displayName: null, active: true, revision: 1,
    natureOverride: null, suggestedResponsibilityOverride: null,
    maintenanceKpiPolicyOverride: null, analyticsDispositionOverride: null,
  };
  const resolved = resolveReasonOption(reason, option, area);
  assert.equal(resolved.technicalAreaId, "pneumatica");
  assert.equal(resolved.optionNameSnapshot, "Pneumática");
  assert.equal(resolved.analyticsDisposition, "test");
  assert.equal(resolved.correctiveCandidate, false);
});

test("RC P0: initially hidden sector appears as occupied only while real call is active", () => {
  const pneumatica = category(true, false);
  const visible = [pneumatica].filter(isDirectSectorButtonEnabled);
  assert.equal(visible.length, 0);
  for (const status of ["open", "in_progress", "post_maintenance"]) {
    const tiles = deriveMachineSectorTiles(visible, [pneumatica], [call(status)]);
    assert.equal(tiles.length, 1);
    assert.equal(tiles[0].activeCall?.id, "ch-1");
    assert.equal(tiles[0].temporarilyVisible, true);
    assert.equal(tiles[0].category.color, "#FFEDE4");
  }
  assert.deepEqual(deriveMachineSectorTiles(visible, [pneumatica], [call("finished")]), []);
  assert.deepEqual(deriveMachineSectorTiles(visible, [pneumatica], [call("cancelled")]), []);
  assert.equal(pneumatica.showDirectButton, false);
  assert.equal(pneumatica.active, true);
});

test("RC P0: two references to same sector or a removed group do not duplicate/hide live call", () => {
  const pneumatica = category(true, false);
  // The pure derivation does not consult mutable group links at all.
  const tiles = deriveMachineSectorTiles([], [pneumatica], [
    call("in_progress", "ch-1"), call("post_maintenance", "ch-2"),
  ]);
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].activeCall?.id, "ch-1");
  assert.deepEqual(deriveMachineSectorTiles([], [pneumatica], []), []);
});

test("RC P0: API/UI/schema use explicit presentation flag, not category inactivation", async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [editor, screen, direct, general, central, legacy, operational, schema, migration] = await Promise.all([
    read("../src/components/settings/CategoriesSettingsTab.tsx"),
    read("../src/pages/MachineDetailPage.tsx"),
    read("../src/components/calls/CallTypeSelector.tsx"),
    read("../src/components/calls/OpenCallModal.tsx"),
    read("../server/src/access/centralCategorySettings.ts"),
    read("../server/src/routes/andonCategories.ts"),
    read("../server/src/routes/callReasons.ts"),
    read("../server/prisma/schema.prisma"),
    read("../server/prisma/migrations/20261119130000_category_direct_button_visibility/migration.sql"),
  ]);
  assert.match(editor, /checked=\{draft\.showDirectButton !== false\}/);
  assert.match(editor, /checked=\{draft\.active\}/);
  assert.match(editor, /showDirectButton: draft\.showDirectButton/);
  assert.match(screen, /setCategories\(items\.filter\(isDirectSectorButtonEnabled\)\)/);
  assert.match(direct, /CALL_TYPE_OPTIONS\.filter\(isDirectSectorButtonEnabled\)/);
  assert.match(general, /getCategoryConfigs\(\)/);
  assert.match(general, /sectorCatalogLoaded \? \(/);
  assert.doesNotMatch(general, /getCategoryConfigs\(\{ activeOnly: true \}\)/);
  assert.match(central, /"showDirectButton"/);
  assert.match(central, /showDirectButton: parsed\.showDirectButton \?\? true/);
  assert.match(central, /showDirectButton: category\.showDirectButton/);
  assert.match(legacy, /showDirectButton/);
  assert.match(operational, /technicalArea: \{ active: true \}/);
  assert.doesNotMatch(operational, /technicalArea: \{[^}]*showDirectButton: true/);
  assert.match(schema, /showDirectButton\s+Boolean\s+@default\(true\)/);
  assert.match(migration, /ADD COLUMN "showDirectButton" BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.doesNotMatch(migration, /UPDATE\s+"andon_categories"\s+SET\s+"active"/i);
});

test("RC P0 #596: one global sector may be hidden on M37 but visible on M38", () => {
  const area=category(true,true);
  assert.equal(isMachineDirectSectorButtonEnabled(area, ["pneumatica"]), false);
  assert.equal(isMachineDirectSectorButtonEnabled(area, []), true);
  assert.equal(isMachineDirectSectorButtonEnabled(area), true);
  assert.equal(isMachineDirectSectorButtonEnabled(category(false,true), []),false);
  assert.equal(isMachineDirectSectorButtonEnabled(category(true,false), []),false);
  const direct37=[area].filter(sector => isMachineDirectSectorButtonEnabled(sector,["pneumatica"]));
  const direct38=[area].filter(sector => isMachineDirectSectorButtonEnabled(sector,[]));
  assert.deepEqual(deriveMachineSectorTiles(direct37,[area],[]),[]);
  assert.equal(deriveMachineSectorTiles(direct38,[area],[]).length,1);
  const temporary=deriveMachineSectorTiles(direct37,[area],[call("open")]);
  assert.equal(temporary.length,1);
  assert.equal(temporary[0].temporarilyVisible,true);
  assert.equal(temporary[0].activeCall?.id,"ch-1");
  assert.equal(temporary[0].category.displayName,"Pneumática");
  assert.deepEqual(deriveMachineSectorTiles(direct37,[area],[call("finished")]),[]);
  assert.deepEqual(deriveMachineSectorTiles(direct38,[area],[]).map(x=>x.category.id),["pneumatica"]);
});

test("RC P0 #596: additive schema and machine-scoped API never alter reason links/history/BI", async () => {
  const read=(path: string) => readFile(new URL(path,import.meta.url),"utf8");
  const [schema, migration, server, settings, screen, api, guard]=await Promise.all([
    read("../server/prisma/schema.prisma"),
    read("../server/prisma/migrations/20261123133000_machine_direct_sector_visibility/migration.sql"),
    read("../server/src/access/centralMachineSettings.ts"),
    read("../src/components/settings/MachineAdminPanel.tsx"),
    read("../src/pages/MachineDetailPage.tsx"),
    read("../server/src/routes/machines.ts"),
    read("../server/src/security/centralMachineSettingsHttp.ts"),
  ]);
  assert.match(schema,/hiddenDirectSectorIds\s+String\[\]\s+@default\(\[\]\)/);
  assert.match(schema,/sectorVisibilityRevision\s+Int\s+@default\(0\)/);
  assert.match(migration,/ALTER TABLE "machines"/);
  assert.doesNotMatch(migration, /DELETE|DROP|UPDATE|andon_calls|call_reasons|failure_events|work_order|analytics/i);
  assert.match(server,/sector_visibility_conflict/);
  assert.match(server,/machine_scope_denied/);
  assert.match(server,/andon\.machine\.sector_visibility\.update/);
  assert.match(settings,/hiddenDirectSectorIds/);
  assert.match(settings,/Setores na tela desta máquina/);
  assert.match(screen,/isMachineDirectSectorButtonEnabled/);
  assert.match(api,/hiddenDirectSectorIds: true/);
  assert.match(guard,/checkCsrf/);
});

test("PENTE5-B CSRF: machine settings PATCH transmits token and retains strict central guard", async () => {
  const read = (p: string) => readFile(new URL(p, import.meta.url), "utf8");
  const [client, adapter, guard, form, errorMessages] = await Promise.all([
    read("../src/api/andonApiClient.ts"),
    read("../src/repositories/apiAndonRepository.ts"),
    read("../server/src/security/centralMachineSettingsHttp.ts"),
    read("../src/components/settings/MachineAdminPanel.tsx"),
    read("../src/api/andonErrorMessages.ts"),
  ]);
  const metadataPattern = /^\/api\/machines\/[a-zA-Z0-9_-]{1,160}$/;
  const needsToken = (method: string, path: string) => method === "PATCH" && metadataPattern.test(path);
  assert.equal(needsToken("PATCH", "/api/machines/10"), true);
  assert.equal(needsToken("PATCH", "/api/machines/M-37"), true);
  assert.equal(needsToken("PATCH", "/api/machines/M-37/production-mode"), false);
  assert.equal(needsToken("PATCH", "/api/machines/M-37/active"), false);
  assert.equal(needsToken("GET", "/api/machines/M-37"), false);
  // Exact client predicate mirrors the central machine-settings route guard.
  assert.ok(client.includes(String.raw`(method === "PATCH" && /^\/api\/machines\/[a-zA-Z0-9_-]{1,160}$/.test(path))`));
  assert.match(client, /getCentralCsrf\(baseUrl, workstationId \?\? ""\)/);
  assert.match(client, /"X-Andon-CSRF": centralCsrf/);
  assert.match(adapter, /this\.apiClient\.patch<ApiMachine>/);
  assert.match(adapter, /\/api\/machines\/\$\{machineId\}/);
  assert.match(guard, /isCentralMachineSettingsMutation/);
  assert.match(guard, /checkCsrf\(readSecureCookie\(request, ACCESS_COOKIE\)/);
  assert.match(form, /await updateMachineCatalog\(selectedMachine\.id, patch\)/);
  assert.match(form, /await updateMachineDirectSectors\(/);
  assert.match(errorMessages, /csrf_denied: "[^"]*tente a operação novamente\."/);
});
