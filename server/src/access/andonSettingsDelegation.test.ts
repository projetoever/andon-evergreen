import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAndonSettingsOrPermission, assertPermission,
  isAndonSettingsDelegate, type Principal,
} from "./policy.js";

const sample: Principal = {
  userId: "u", login: "operator", displayName: "Test Operator",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"],
  permissions: ["andon.read", "andon.settings.open"], sessionId: "s",
  workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};

test("R10-09: a config grant delegates catalog privileges regardless of profile label", () => {
  for (const roleLabel of [
    "Produção", "Manutenção", "Líder", "Gestor/Gerente", "Personalizado",
  ]) {
    const principal = { ...sample, roleLabel };
    assert.equal(isAndonSettingsDelegate(principal), true);
    for (const permission of [
      "catalog.assets.manage", "catalog.reasons.manage",
      "catalog.classifications.manage", "catalog.technicians.manage",
    ] as const) {
      assert.doesNotThrow(() => assertAndonSettingsOrPermission(principal, permission));
      assert.throws(() => assertPermission(principal, permission),
        (e: unknown) => e instanceof Error &&
          "code" in e && e.code === "permission_denied");
    }
    // No delegation into Hub administration, secrets, BI, device or operational calls.
    for (const forbidden of [
      "users.create", "workstations.manage", "audit.export",
      "hub.settings.presentation.write", "priorities.write", "bi.export",
      "calls.cancel.any", "machines.status.write",
    ] as const) {
      for (const operation of [
        () => assertPermission(principal, forbidden),
        () => assertAndonSettingsOrPermission(principal, forbidden),
      ]) {
        assert.throws(operation, (e: unknown) => e instanceof Error &&
          "code" in e && e.code === "permission_denied");
      }
    }
  }
});

test("R10-09: a mere role name, kiosk identity or provisional login cannot delegate", () => {
  const denied = [
    { ...sample, permissions: ["andon.read"] },
    { ...sample, accountType: "kiosk" },
    { ...sample, purpose: "password_change" },
    { ...sample, purpose: "workstation_admission" },
  ];
  for (const principal of denied) {
    assert.equal(isAndonSettingsDelegate(principal), false);
    assert.throws(() => assertAndonSettingsOrPermission(principal, "catalog.assets.manage"));
  }
  assert.equal(isAndonSettingsDelegate({ ...sample, roleLabel: "Produção", permissions: ["andon.read"] }), false);
});
