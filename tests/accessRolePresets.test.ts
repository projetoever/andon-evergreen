import assert from "node:assert/strict";
import test from "node:test";
import {
  MODULE_ENTRY_PERMISSIONS,
  hasRoleSuggestion,
  suggestedPermissions,
} from "../src/services/accessRolePresets";

const catalog = [
  "andon.read",
  "history.read",
  "calls.open",
  "calls.attend",
  "calls.finishMaintenance",
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
    ["andon.read", "bi.read", "priorities.read"],
  );
});
