import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, assertModule, assertPermission, type Principal } from "./policy.js";

const activeStationWithLegacyModulesOff = {
  allowOperational: false,
  allowBi: false,
  allowPriorities: false,
};
const principal: Principal = {
  userId: "admin", login: "admin", displayName: "Admin",
  roleLabel: "Admin", accountType: "person", isPrimaryAdmin: true,
  machineScope: "all", machineIds: [], permissions: [],
  sessionId: "session", workstationId: "ws-approved",
  purpose: "normal", authenticatedAt: new Date(),
};

test("primary Admin has access to all central modules regardless of legacy workstation flags", () => {
  for (const module of ["operational", "bi", "priorities"] as const) {
    assert.doesNotThrow(() => assertModule(principal, activeStationWithLegacyModulesOff, module));
  }
  assert.doesNotThrow(() => assertPermission(principal, "andon.settings.open"));
});

test("other central users require module-specific permissions, not a station toggle", () => {
  const user = { ...principal, userId: "leader", isPrimaryAdmin: false, roleLabel: "Líder", permissions: ["andon.read"] };
  assert.doesNotThrow(() => assertModule(user, activeStationWithLegacyModulesOff, "operational"));
  assert.throws(() => assertModule(user, activeStationWithLegacyModulesOff, "bi"),
    (error: unknown) => error instanceof AccessError && error.code === "permission_denied");
  assert.throws(() => assertPermission(user, "andon.settings.open"),
    (error: unknown) => error instanceof AccessError && error.code === "permission_denied");
  // Selecting a machine does not revoke the account's module grant.
  // Data endpoints still require their own SQL-scoped query contract.
  const scopedUser = { ...user, machineScope: "selected", machineIds: ["machine-37"] };
  assert.doesNotThrow(() => assertModule(scopedUser, activeStationWithLegacyModulesOff, "operational"));
  assert.throws(() => assertModule(scopedUser, activeStationWithLegacyModulesOff, "bi"),
    (error: unknown) => error instanceof AccessError && error.code === "permission_denied");
  assert.throws(() => assertModule({ ...user, purpose: "password_change" }, activeStationWithLegacyModulesOff, "operational"),
    (error: unknown) => error instanceof AccessError && error.code === "password_change_required");
});
