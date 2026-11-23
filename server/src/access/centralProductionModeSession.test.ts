import assert from "node:assert/strict";
import test from "node:test";
import { AccessError, type Principal } from "./policy.js";
import { assertSessionProductionScheduleWrite } from "./centralProductionModeSession.js";

const actor: Principal = {
  userId: "writer", login: "writer", displayName: "Writer",
  roleLabel: "Gerente", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"],
  permissions: ["andon.read", "production.schedule.write"],
  sessionId: "session", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};

const denies = (fn: () => void, code: string) =>
  assert.throws(fn, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("PENTE 2 direct schedule requires explicit write and machine scope", () => {
  assert.doesNotThrow(() => assertSessionProductionScheduleWrite(actor, "37"));
  denies(() => assertSessionProductionScheduleWrite(actor, "38"), "machine_scope_denied");
  denies(() => assertSessionProductionScheduleWrite({
    ...actor, permissions: ["andon.read", "production.schedule.request"],
  }, "37"), "permission_denied");
  denies(() => assertSessionProductionScheduleWrite({
    ...actor, permissions: ["production.schedule.write"],
  }, "37"), "permission_denied");
  denies(() => assertSessionProductionScheduleWrite({
    ...actor, permissions: ["andon.read", "priorities.write"],
  }, "37"), "permission_denied");
});

test("PENTE 2 only an active normal person session may use direct scheduling", () => {
  denies(() => assertSessionProductionScheduleWrite({
    ...actor, accountType: "kiosk",
  }, "37"), "permission_denied");
  denies(() => assertSessionProductionScheduleWrite({
    ...actor, purpose: "password_change",
  }, "37"), "permission_denied");
  assert.doesNotThrow(() => assertSessionProductionScheduleWrite({
    ...actor, isPrimaryAdmin: true, machineScope: "all", machineIds: [],
    permissions: [],
  }, "other-machine"));
});
