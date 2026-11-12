import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  MODULE_ENTRY_PERMISSIONS,
  PILOT_OPERATIONAL_ACTIONS,
  SCREEN_UNLOCK_PERMISSION,
  PILOT_SIMPLE_ROLES,
  SIMPLE_MODULE_GROUPS,
  simpleModuleGrants,
  simpleModuleState,
  toggleSimpleModule,
  hasRoleSuggestion,
  isExactRolePreset,
  suggestedPermissions,
  toggleAndonModulePermission,
} from "../src/services/accessRolePresets";

const catalog = [
  "andon.read",
  "history.read",
  "calls.open",
  "calls.cancel.own",
  "calls.attend",
  "calls.technicians.manage",
  "calls.finishMaintenance",
  "calls.finish",
  "analytics.reclassify",
  "calls.cancel.any",
  "calls.followUp",
  "calls.returnToMaintenance",
  "diagnosis.edit",
  "bi.read",
  "bi.export",
  "priorities.read",
  "priorities.write",
  "workstations.manage",
  "users.create",
];

test("role suggestions require an explicit action and never imply admin powers", () => {
  for (const role of ["Gestor/Gerente", "Líder", "Manutenção", "Produção"]) {
    assert.equal(hasRoleSuggestion(role), true);
    const perms = suggestedPermissions(role, catalog);
    assert(perms.includes("andon.read"), role);
    assert.equal(perms.includes("workstations.manage"), false, role);
    assert.equal(perms.includes("users.create"), false, role);
  }
  const maintenance = suggestedPermissions("Manutenção", catalog);
  assert(maintenance.includes("calls.technicians.manage"));
  assert(maintenance.includes("calls.finish"));
  assert(maintenance.includes("diagnosis.edit"));
  assert(!maintenance.includes("analytics.reclassify"),
    "BI reclassification is an independent explicit admin grant");
  assert(!suggestedPermissions("Produção", catalog).includes("calls.technicians.manage"));
  assert(!suggestedPermissions("Líder", catalog).includes("calls.technicians.manage"));
  assert.equal(hasRoleSuggestion("Admin"), false);
  assert.deepEqual(suggestedPermissions("Admin", catalog), []);
  assert.deepEqual(suggestedPermissions("unknown", catalog), []);
});

test("suggestions are strictly limited to the permitted catalog", () => {
  assert.deepEqual(suggestedPermissions("Gestor/Gerente", ["bi.read"]), ["bi.read"]);
  assert.deepEqual(suggestedPermissions("Líder", ["calls.open", "priorities.read"]), [
    "calls.open",
    "priorities.read",
  ]);
  assert.deepEqual(suggestedPermissions("Produção", []), []);
  assert.deepEqual(
    MODULE_ENTRY_PERMISSIONS.map((item) => item.key),
    ["andon.read", "bi.read", "priorities.read", "andon.settings.open"],
  );
});

test("pilot registration defaults to Production, with an explicit advanced path", () => {
  assert.deepEqual([...PILOT_SIMPLE_ROLES], ["Produção", "Manutenção", "Líder", "Gestor/Gerente"]);
  assert.deepEqual(suggestedPermissions("Produção", [
    "andon.read", "history.read", "calls.open", "calls.cancel.own",
    "calls.attend", "bi.read", "users.create",
  ]), ["andon.read", "calls.open", "calls.cancel.own"]);
  assert(isExactRolePreset("Produção", ["calls.cancel.own", "andon.read", "calls.open"], catalog));
  assert(!isExactRolePreset("Produção", ["andon.read"], catalog));
  assert(!isExactRolePreset("Produção", ["andon.read", "calls.open", "calls.cancel.own", "users.create"], catalog));
  assert(!isExactRolePreset("Líder desconhecido", [], catalog));
});
test("Manager and maintenance templates are operational, never user or service administration", () => {
  const fullCatalog = [
    ...catalog,
    "workstations.read", "hub.settings.presentation.write", "audit.read", "analytics.policy.manage",
    "catalog.assets.manage", "production.schedule.write", "machines.status.write",
  ];
  const manager = suggestedPermissions("Gestor/Gerente", fullCatalog);
  const maintenance = suggestedPermissions("Manutenção", fullCatalog);
  assert(manager.includes("bi.read") && manager.includes("workstations.read"));
  assert(manager.includes("hub.settings.presentation.write"));
  assert(!maintenance.includes("hub.settings.presentation.write"));
  assert(manager.includes("calls.open") && manager.includes("priorities.write"));
  assert(!manager.includes("users.create") && !manager.includes("workstations.manage"));
  assert(!manager.includes("analytics.policy.manage") && !manager.includes("catalog.assets.manage"));
  assert(maintenance.includes("bi.read") && maintenance.includes("calls.attend"));
  assert(!maintenance.includes("workstations.read") && !maintenance.includes("users.create"));
});

test("R10-09: granting ANDON settings in any profile enables only minimum ANDON module read", () => {
  for (const role of ["Produção", "Manutenção", "Líder", "Gestor/Gerente", "Personalizado"]) {
    const before = suggestedPermissions(role, catalog).filter(key => key !== "andon.read");
    const granted = toggleAndonModulePermission(before, "andon.settings.open", true);
    assert(granted.includes("andon.settings.open"), role);
    assert(granted.includes("andon.read"), role);
    assert(!granted.includes("users.create"));
    assert(!granted.includes("workstations.manage"));
    assert(!granted.includes("bi.export") || before.includes("bi.export"));
    const revoked = toggleAndonModulePermission(granted, "andon.read", false);
    assert(!revoked.includes("andon.settings.open"));
    assert(!revoked.includes("andon.read"));
  }
  assert.deepEqual(toggleAndonModulePermission([], "andon.settings.open", true),
    ["andon.settings.open", "andon.read"]);
  assert.deepEqual(toggleAndonModulePermission(["andon.read", "andon.settings.open"],
    "andon.settings.open", false), ["andon.read"]);
});

test("REFINE 11: individual machine-screen unpin requires ANDON read and is not in role presets", () => {
  assert.equal(SCREEN_UNLOCK_PERMISSION, "workstations.screen.unlock");
  for (const role of ["Produção", "Manutenção", "Líder", "Gestor/Gerente"]) {
    const list = suggestedPermissions(role, [...catalog, SCREEN_UNLOCK_PERMISSION]);
    assert(!list.includes(SCREEN_UNLOCK_PERMISSION), "role presets must not auto-grant screen release");
  }
  const granted = toggleAndonModulePermission([], SCREEN_UNLOCK_PERMISSION, true);
  assert.deepEqual(granted, [SCREEN_UNLOCK_PERMISSION, "andon.read"]);
  assert.deepEqual(
    toggleAndonModulePermission(granted, SCREEN_UNLOCK_PERMISSION, false),
    ["andon.read"], "revoking screen permission does not remove the ANDON module");
  assert.deepEqual(
    toggleAndonModulePermission(granted, "andon.read", false),
    [], "removing ANDON access also revokes screen release");
});


test("REFINE 16 P0: opening a call is explicitly granted, never inferred from ANDON read", () => {
  const actions: string[] = PILOT_OPERATIONAL_ACTIONS.map((entry) => entry.key);
  assert(actions.includes("calls.open"));
  assert(actions.includes("calls.attend"));
  assert(actions.includes("calls.finish"));
  assert(!actions.includes("users.create"));
  assert(!actions.includes("workstations.manage"));
  assert(!actions.includes("calls.cancel.any"));
  const existingCustom = ["andon.read", "bi.read", "andon.settings.open"];
  const afterOpeningGrant = toggleAndonModulePermission(existingCustom, "calls.open", true);
  assert.deepEqual(afterOpeningGrant, [...existingCustom, "calls.open"]);
  assert.equal(existingCustom.includes("calls.open"), false,
    "a user viewing ANDON must not gain an open-call permission implicitly");
  assert.deepEqual(
    toggleAndonModulePermission(afterOpeningGrant, "calls.open", false),
    existingCustom, "revoking call opening leaves custom grants untouched",
  );
  assert.equal(suggestedPermissions("Gestor/Gerente", catalog).includes("calls.open"), true);
});


test("REFINE 16 P0: simple editor exposes exactly four grouped modules, never individual call controls", async () => {
  assert.deepEqual(SIMPLE_MODULE_GROUPS.map((entry) => entry.label), [
    "ANDON", "BI", "Prioridades", "Config. do ANDON",
  ]);
  const source = await readFile(
    new URL("../src/components/settings/UsersAccessSettings.tsx", import.meta.url), "utf8",
  );
  const simple = source.slice(
    source.indexOf('                  {!advancedPermissions && ('),
    source.indexOf('                  {advancedPermissions && <fieldset'),
  );
  assert.match(simple, /SIMPLE_MODULE_GROUPS\.map/);
  assert.match(simple, /simpleModuleState\(/);
  assert.match(simple, /toggleSimpleModule\(/);
  assert.doesNotMatch(simple, /PILOT_OPERATIONAL_ACTIONS|SCREEN_UNLOCK_PERMISSION/);
  assert.doesNotMatch(simple, /Chamados: abrir|Cancelar chamados próprios|Concluir manutenção/);
  assert.match(source, /Role classification never overwrites an existing ACL/);
  assert.match(source, /A new account starts without grants/);
});

test("REFINE 16 P0: grouped ANDON enables manager call lifecycle and preserves unrelated grants", () => {
  const available = [...new Set([...catalog,
    "machines.status.write", "production.schedule.write", "workstations.screen.unlock",
    "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
    "andon.settings.open", "audit.read", "analytics.policy.manage",
  ])];
  const existing = ["andon.read", "history.read", "bi.read", "audit.read"];
  assert.equal(simpleModuleState(existing, "andon", "Gestor/Gerente", available), "partial");
  const granted = toggleSimpleModule(existing, "andon", "Gestor/Gerente", available, true);
  for (const key of [
    "andon.read", "calls.open", "calls.attend", "calls.finishMaintenance",
    "calls.finish", "calls.technicians.manage", "calls.followUp",
    "calls.returnToMaintenance", "calls.cancel.own", "calls.cancel.any",
  ]) assert(granted.includes(key), "missing manager call grant: " + key);
  for (const key of ["bi.read", "audit.read"]) assert(granted.includes(key));
  for (const forbidden of [
    "users.create", "workstations.manage", "workstations.screen.unlock",
    "analytics.policy.manage", "catalog.assets.manage",
  ]) assert(!granted.includes(forbidden), "accidental privilege escalation: " + forbidden);
  assert.equal(simpleModuleState(granted, "andon", "Gestor/Gerente", available), "on");

  const revoked = toggleSimpleModule([...granted, "workstations.screen.unlock"],
    "andon", "Gestor/Gerente", available, false);
  for (const key of ["calls.open", "calls.attend", "calls.finish", "calls.cancel.any",
    "andon.read", "workstations.screen.unlock"]) assert(!revoked.includes(key));
  assert.deepEqual(revoked, ["bi.read", "audit.read"],
    "turning off ANDON must not erase BI or independently authorized audit");
});

test("REFINE 16 P0: production ANDON stays production-safe, and BI/Priorities/Config are independent bundles", () => {
  const available = [...new Set([...catalog, "andon.settings.open",
    "catalog.assets.manage", "catalog.reasons.manage",
    "catalog.classifications.manage", "catalog.technicians.manage",
    "analytics.policy.manage", "workstations.screen.unlock",
  ])];
  const productionAndon = toggleSimpleModule([], "andon", "Produção", available, true);
  assert.deepEqual(productionAndon, ["andon.read", "calls.open", "calls.cancel.own"]);
  assert.equal(simpleModuleState(productionAndon, "andon", "Produção", available), "on");
  for (const key of ["calls.attend", "calls.finish", "calls.cancel.any",
    "workstations.screen.unlock", "users.create"]) assert(!productionAndon.includes(key));

  const withBi = toggleSimpleModule(productionAndon, "bi", "Produção", available, true);
  assert(withBi.includes("bi.read") && withBi.includes("bi.export"));
  assert(!withBi.includes("analytics.reclassify"));
  const managerBi = simpleModuleGrants("bi", "Gestor/Gerente", available);
  assert(managerBi.includes("analytics.reclassify"),
    "manager BI bundle may reclassify, subject to server flags/audit");
  const withPriorities = toggleSimpleModule(withBi, "priorities", "Produção", available, true);
  assert(withPriorities.includes("priorities.read") &&
    withPriorities.includes("priorities.write"));
  const withConfig = toggleSimpleModule([], "andonSettings", "Produção", available, true);
  for (const key of ["andon.read", "andon.settings.open", "catalog.assets.manage",
    "catalog.technicians.manage"]) assert(withConfig.includes(key));
  for (const key of ["users.create", "workstations.manage", "calls.open",
    "analytics.policy.manage", "workstations.screen.unlock"]) assert(!withConfig.includes(key));
  assert.equal(simpleModuleState(withConfig, "andon", "Produção", available), "partial",
    "config-only cannot appear as full ANDON operational access");
  const disabledAndon = toggleSimpleModule(
    [...withConfig, ...productionAndon], "andon", "Produção", available, false,
  );
  assert(disabledAndon.includes("andon.read"),
    "config still needs minimum ANDON read even when operations are disabled");
  assert(disabledAndon.includes("andon.settings.open"));
  assert(!disabledAndon.includes("calls.open"));
  const disabledConfig = toggleSimpleModule(withConfig, "andonSettings", "Produção", available, false);
  assert(!disabledConfig.includes("andon.settings.open"));
  assert(!disabledConfig.includes("catalog.reasons.manage"));
  const nonOverlapping = toggleSimpleModule(withPriorities, "bi", "Produção", available, false);
  assert(!nonOverlapping.includes("bi.read") && !nonOverlapping.includes("bi.export"));
  assert(nonOverlapping.includes("calls.open") && nonOverlapping.includes("priorities.write"));
});
