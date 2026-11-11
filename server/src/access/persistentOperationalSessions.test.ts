import assert from "node:assert/strict";
import test from "node:test";
import { permitsPersistentOperationalAccount } from "./sessions.js";

const user = {
  accountType: "person", isPrimaryAdmin: false, mustChangePassword: false,
  permissions: [{ key: "andon.read" }, { key: "calls.open" }],
};
const station = {
  active: true, pendingApproval: false, allowPersistentOperationalLogin: true,
  lockedMachineId: "37",
};
const machines = [{ machineId: "37" }];

test("REFINE15: operator Production and least-privileged maintenance can remain signed in", () => {
  assert.equal(permitsPersistentOperationalAccount(user, station, machines, "selected"), true);
  assert.equal(permitsPersistentOperationalAccount(user, station, [], "all"), true);
  assert.equal(permitsPersistentOperationalAccount({
    ...user, permissions: [...user.permissions, { key: "calls.attend" }, { key: "calls.finishMaintenance" }],
  }, station, machines, "selected"), true);
});

test("REFINE15: no persistent Admin, security manager, unapproved station, or unpinned screen", () => {
  assert.equal(permitsPersistentOperationalAccount({ ...user, isPrimaryAdmin: true },
    station, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount({ ...user, mustChangePassword: true },
    station, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount({ ...user, accountType: "kiosk" },
    station, machines, "selected"), false);
  for (const key of ["users.create", "workstations.manage", "andon.settings.open",
    "analytics.policy.manage", "audit.read", "catalog.assets.manage"]) {
    assert.equal(permitsPersistentOperationalAccount({
      ...user, permissions: [...user.permissions, { key }],
    }, station, machines, "selected"), false, key);
  }
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, lockedMachineId: null }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, active: false }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, pendingApproval: true }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, allowPersistentOperationalLogin: false }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user, station,
    [{ machineId: "39" }], "selected"), false);
});
