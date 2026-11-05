import assert from "node:assert/strict";
import test from "node:test";
import { KIOSK_OPERATIONS, evaluateKioskTrust, type KioskTrustPolicyInput } from "./kioskTrustPolicy.js";

const now = new Date("2026-11-05T20:00:00.000Z");
const stationId = "ws_00000000-0000-4000-8000-000000000001";
function eligible(): KioskTrustPolicyInput {
  return {
    featureEnabled: true,
    centralAccessEnabled: true,
    account: {
      active: true, accountType: "kiosk", isPrimaryAdmin: false,
      mustChangePassword: false, machineScope: "selected", machineIds: ["37"],
      permissions: [...KIOSK_OPERATIONS], authorizationVersion: 7,
    },
    station: { id: stationId, active: true, pendingApproval: false },
    lease: {
      workstationId: stationId, machineId: "37",
      approvedByPrimaryAdmin: true, approved: true, authorizationVersion: 7,
      revokedAt: null, expiresAt: new Date("2026-11-06T20:00:00.000Z"),
    },
    deviceProofVerified: true, machineId: "37", operation: "calls.open", now,
  };
}
function denied(input: KioskTrustPolicyInput, reason: string) {
  assert.deepEqual(evaluateKioskTrust(input), { allowed: false, reason });
}
test("R9-05: feature OFF by default denies all kiosk privileges", () => {
  denied({ ...eligible(), featureEnabled: false }, "feature_disabled");
  denied({ ...eligible(), centralAccessEnabled: false }, "feature_disabled");
});
test("R9-05: only an approved, active station and actual kiosk account may qualify", () => {
  const p = eligible();
  denied({ ...p, station: null }, "station_denied");
  denied({ ...p, station: { ...p.station!, active: false } }, "station_denied");
  denied({ ...p, station: { ...p.station!, pendingApproval: true } }, "station_denied");
  for (const patch of [
    { accountType: "person" }, // human Production login cannot become kiosk
    { accountType: "person", isPrimaryAdmin: true }, // Admin never kiosk
    { accountType: "kiosk", isPrimaryAdmin: true },
    { active: false }, { mustChangePassword: true },
  ]) denied({ ...p, account: { ...p.account, ...patch } }, "account_denied");
});
test("R9-06: kiosk permission set is strictly minimal, no Admin/BI/Priorities/write bypass", () => {
  const p = eligible();
  for (const permissions of [
    [], ["calls.open"], ["andon.read"], ["andon.read", "andon.read"],
    ["andon.read", "calls.open", "bi.read"],
    ["andon.read", "calls.open", "priorities.read"],
    ["andon.read", "calls.open", "workstations.manage"],
    ["andon.read", "calls.open", "calls.cancel.any"],
  ]) denied({ ...p, account: { ...p.account, permissions } }, "grant_denied");
  for (const operation of [
    "bi.read", "priorities.read", "workstations.manage", "users.manage",
    "calls.cancel.any", "calls.attend", "calls.finish", "machine.write",
    "gpio", "node-red", "shell",
  ]) denied({ ...p, operation }, "action_denied");
});
test("R9-06: kiosk account/lease may operate only its single authorized machine", () => {
  const p = eligible();
  denied({ ...p, machineId: "39" }, "scope_denied");
  denied({ ...p, account: { ...p.account, machineScope: "all" } }, "scope_denied");
  denied({ ...p, account: { ...p.account, machineIds: ["37", "39"] } }, "scope_denied");
  denied({ ...p, account: { ...p.account, machineIds: [] } }, "scope_denied");
  denied({ ...p, lease: { ...p.lease!, machineId: "39" } }, "trust_denied");
  denied({ ...p, lease: { ...p.lease!, workstationId: "another-station" } }, "trust_denied");
});
test("R9-05: lease and proof must be server-verified; UUID/heartbeat cannot stand in", () => {
  const p = eligible();
  denied({ ...p, lease: null }, "trust_denied");
  denied({ ...p, lease: { ...p.lease!, approved: false } }, "trust_denied");
  denied({ ...p, lease: { ...p.lease!, approvedByPrimaryAdmin: false } }, "trust_denied");
  denied({ ...p, lease: { ...p.lease!, revokedAt: now } }, "trust_denied");
  denied({ ...p, lease: { ...p.lease!, authorizationVersion: 6 } }, "trust_denied");
  denied({ ...p, deviceProofVerified: false }, "device_proof_required");
  denied({ ...p, lease: { ...p.lease!, expiresAt: now } }, "lease_expired");
  denied({ ...p, lease: { ...p.lease!, expiresAt: new Date(now.getTime() - 1) } }, "lease_expired");
  denied({ ...p, now: new Date(Number.NaN) }, "lease_expired");
});
test("R9-06: valid kiosk proof can read or open only; no infinite human session is issued", () => {
  for (const operation of KIOSK_OPERATIONS)
    assert.deepEqual(evaluateKioskTrust({ ...eligible(), operation }), {
      allowed: true, operation, machineId: "37",
    });
});
