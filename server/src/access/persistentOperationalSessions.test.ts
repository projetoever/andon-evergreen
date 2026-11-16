import assert from "node:assert/strict";
import test from "node:test";
import { permitsPersistentOperationalAccount, persistentOperationalBlocker } from "./sessions.js";
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

test("SEC21: no persistent Admin or unapproved station, but fixed machine is optional", () => {
  assert.equal(permitsPersistentOperationalAccount({ ...user, isPrimaryAdmin: true },
    station, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount({ ...user, mustChangePassword: true },
    station, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount({ ...user, accountType: "kiosk" },
    station, machines, "selected"), false);
  // An account retains precisely its selected grants. The API independently
  // enforces recent Admin credentials, module ACL and pinned machine scope.
  for (const key of ["workstations.manage", "andon.settings.open", "catalog.assets.manage"]) {
    assert.equal(permitsPersistentOperationalAccount({
      ...user, permissions: [...user.permissions, { key }],
    }, station, machines, "selected"), true, key);
  }
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, lockedMachineId: null }, machines, "selected"), true);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, active: false }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, pendingApproval: true }, machines, "selected"), false);
  assert.equal(permitsPersistentOperationalAccount(user,
    { ...station, allowPersistentOperationalLogin: false }, machines, "selected"), true,
    "legacy workstation flag must not control user session duration");
  assert.equal(permitsPersistentOperationalAccount(user, station,
    [{ machineId: "39" }], "selected"), true,
    "session duration does not replace the user's machine scope");
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


test("SEC21 P0: persistent login must reveal its exact nonsecret failure reason", () => {
  assert.equal(persistentOperationalBlocker(user, station, machines, "selected"), null);
  const cases = [
    { reason: "policy_not_persistent", u: { ...user, sessionPolicy: "daily" }, s: station, m: machines },
    { reason: "account_type_not_supported", u: { ...user, accountType: "kiosk" }, s: station, m: machines },
    { reason: "primary_admin_not_eligible", u: { ...user, isPrimaryAdmin: true }, s: station, m: machines },
    { reason: "password_change_required", u: { ...user, mustChangePassword: true }, s: station, m: machines },
    { reason: "workstation_not_approved", u: user, s: { ...station, active: false }, m: machines },
    { reason: "workstation_not_approved", u: user, s: { ...station, pendingApproval: true }, m: machines },
    { reason: "no_selected_permissions", u: { ...user, permissions: [] }, s: station, m: machines },
  ];
  for (const entry of cases) {
    assert.equal(persistentOperationalBlocker(entry.u, entry.s, entry.m, "selected"), entry.reason);
    assert.equal(permitsPersistentOperationalAccount(entry.u, entry.s, entry.m, "selected"), false);
  }
  assert.equal(persistentOperationalBlocker(user, station, [], "all"), null);
  assert.equal(persistentOperationalBlocker(user, { ...station, lockedMachineId: null }, machines, "selected"), null);
  assert.equal(persistentOperationalBlocker(user, { ...station, lockedMachineId: "39" }, machines, "selected"), null);
  assert.equal(persistentOperationalBlocker({
    ...user, permissions: [...user.permissions, { key: "catalog.assets.manage" }],
  }, station, machines, "selected"), null, "the profile ACL must never be replaced by session duration");
});
