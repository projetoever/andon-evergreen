import assert from "node:assert/strict";
import test from "node:test";
import { permitsPersistentOperationalAccount } from "./sessions.js";
import { validateUser } from "./users.js";

const user = {
  accountType: "person", sessionPolicy: "persistent", isPrimaryAdmin: false, mustChangePassword: false,
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


test("SEC-18: trusted station never overrides user session opt-in", () => {
  assert.equal(permitsPersistentOperationalAccount({ ...user, sessionPolicy: "standard" }, station, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount({ ...user, sessionPolicy: undefined }, station, machines, "selected"), false);
});

test("SEC-18: a persistent Person account can be deactivated without changing its policy", () => {
  const draft = {
    login: "production37",
    displayName: "Production terminal 37",
    roleLabel: "Produção",
    accountType: "person" as const,
    active: false,
    machineScope: "selected" as const,
    sessionPolicy: "persistent" as const,
    permissions: ["andon.read", "calls.open"],
    machineIds: ["37"],
  };
  assert.doesNotThrow(() => validateUser({ ...draft }));
  assert.throws(() => validateUser({ ...draft, accountType: "kiosk" }),
    /invalid_user/);
});
