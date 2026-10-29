import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "./policy.js";
import { AccessError } from "./policy.js";
import { preflightCentralGlobalCatalogWrite } from "./centralGlobalCatalogPreflight.js";
const base: Principal = {
  userId: "u", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: false, machineScope: "all", machineIds: [],
  permissions: ["andon.read", "catalog.assets.manage", "catalog.reasons.manage", "catalog.classifications.manage"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date("2026-10-29T12:00:00Z"),
};
const station = { id: "ws", active: true, pendingApproval: false,
  allowOperational: true, allowBi: false, allowPriorities: false };
const routes = [
  ["POST", "/api/machine-set-types", "catalog.assets.manage"],
  ["PATCH", "/api/machine-set-types/id", "catalog.assets.manage"],
  ["DELETE", "/api/machine-set-types/id", "catalog.assets.manage"],
  ["POST", "/api/machine-subset-types", "catalog.assets.manage"],
  ["PATCH", "/api/machine-subset-types/id", "catalog.assets.manage"],
  ["DELETE", "/api/machine-subset-types/id", "catalog.assets.manage"],
  ["POST", "/api/andon-categories", "catalog.reasons.manage"],
  ["PATCH", "/api/andon-categories/id", "catalog.reasons.manage"],
  ["DELETE", "/api/andon-categories/id", "catalog.reasons.manage"],
  ["POST", "/api/failure-classifications", "catalog.classifications.manage"],
  ["PATCH", "/api/failure-classifications/id", "catalog.classifications.manage"],
] as const;
const check = (method: string, path: string, principal = base, workstation = station) =>
  preflightCentralGlobalCatalogWrite({ principal, workstation, request: { method, path } });
async function denied(action: () => unknown, code: string) {
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);
}
test("SEC-04/2B.2: each of eleven global routes resolves its least-privilege permission", () => {
  for (const [method, path, permission] of routes)
    assert.equal(check(method, path).permission, permission);
});
test("SEC-04/2B.2: global catalog operations cannot be granted to machine-scoped accounts", () => {
  for (const [method, path] of routes)
    denied(() => check(method, path, { ...base, machineScope: "selected", machineIds: ["37"] }), "scoped_query_required");
});
test("SEC-04/2B.2: deny wrong privilege, unapproved station, device mismatch, and provisional identity", () => {
  for (const [method, path] of routes) {
    denied(() => check(method, path, { ...base, permissions: ["andon.read"] }), "permission_denied");
    denied(() => check(method, path, base, { ...station, pendingApproval: true }), "workstation_inactive");
    denied(() => check(method, path, base, { ...station, active: false }), "workstation_inactive");
    denied(() => check(method, path, base, { ...station, id: "other" }), "workstation_session_mismatch");
    denied(() => check(method, path, { ...base, purpose: "password_change" }), "password_change_required");
    denied(() => check(method, path, base, { ...station, allowOperational: false }), "workstation_module_denied");
  }
});
test("SEC-04/2B.2: methods and unrelated routes are unsupported", () => {
  for (const [method, path] of [["GET", "/api/andon-categories"], ["DELETE", "/api/failure-classifications/id"], ["POST", "/api/andon-calls"], ["PUT", "/api/machine-set-types"]])
    denied(() => check(method, path), "central_action_not_supported");
});
