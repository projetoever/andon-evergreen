import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULE_ENTRY_PERMISSIONS,
  PILOT_OPERATIONAL_ACTIONS,
  SCREEN_UNLOCK_PERMISSION,
  PILOT_SIMPLE_ROLES,
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
