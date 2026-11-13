import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, type Principal } from "./policy.js";
import { assertScheduleRequestPermission, mayApproveProductionMode } from "./centralProductionModeCredential.js";

const actor: Principal = {
  userId: "prod", login: "production", displayName: "Production",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["10"],
  permissions: ["andon.read", "production.schedule.request"],
  sessionId: "session", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};

test("schedule request is a limited operational grant, not direct write authority", () => {
  assert.doesNotThrow(() => assertScheduleRequestPermission(actor, "10"));
  assert.throws(() => assertScheduleRequestPermission(actor, "15"),
    (e: unknown) => e instanceof AccessError && e.code === "machine_scope_denied");
  assert.throws(() => assertScheduleRequestPermission({
    ...actor, permissions: ["andon.read"],
  }, "10"), (e: unknown) => e instanceof AccessError && e.code === "permission_denied");
  // Pre-existing non-persistent manager grants remain compatible.
  assert.doesNotThrow(() => assertScheduleRequestPermission({
    ...actor, permissions: ["andon.read", "production.schedule.write"],
  }, "10"));
});

test("a terminal request alone can never approve production scheduling", () => {
  const verifier = {
    active: true, accountType: "person", mustChangePassword: false,
    isPrimaryAdmin: false, machineScope: "selected",
    machines: [{ machineId: "10" }],
    permissions: [{ key: "andon.read" }, { key: "production.schedule.write" }],
  };
  assert.equal(mayApproveProductionMode(verifier, "10"), true);
  assert.equal(mayApproveProductionMode(verifier, "15"), false);
  assert.equal(mayApproveProductionMode({
    ...verifier, permissions: [{ key: "andon.read" }, { key: "production.schedule.request" }],
  }, "10"), false);
  assert.equal(mayApproveProductionMode({ ...verifier, active: false }, "10"), false);
  assert.equal(mayApproveProductionMode({ ...verifier, mustChangePassword: true }, "10"), false);
  assert.equal(mayApproveProductionMode({ ...verifier, accountType: "kiosk" }, "10"), false);
  assert.equal(mayApproveProductionMode({ ...verifier, isPrimaryAdmin: true, machineScope: "all" }, "15"), true);
  assert.equal(mayApproveProductionMode({ ...verifier, isPrimaryAdmin: true, machineScope: "selected" }, "15"), false);
});
