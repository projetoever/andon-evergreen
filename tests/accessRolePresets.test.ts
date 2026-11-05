import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULE_ENTRY_PERMISSIONS,
  PILOT_SIMPLE_ROLES,
  hasRoleSuggestion,
  isExactRolePreset,
  suggestedPermissions,
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
