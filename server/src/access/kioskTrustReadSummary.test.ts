import assert from "node:assert/strict";
import test from "node:test";
import { kioskTrustReadSummary } from "./kioskTrustReadSummary.js";

const now = new Date("2026-11-05T20:00:00.000Z");
const future = new Date("2026-11-06T20:00:00.000Z");

test("R10-04: kiosk read summary is safe for existing workstations without any lease", () => {
  assert.deepEqual(kioskTrustReadSummary(null, now), {
    state: "not_configured", machineId: null, expiresAt: null,
  });
});
test("R10-04: pending, revoked, expired and provisioned rows never claim a trusted kiosk", () => {
  const base = { status: "pending", machineId: "37", expiresAt: future, revokedAt: null };
  assert.equal(kioskTrustReadSummary(base, now).state, "pending");
  assert.equal(kioskTrustReadSummary({ ...base, status: "revoked", revokedAt: now }, now).state, "revoked");
  assert.equal(kioskTrustReadSummary({ ...base, status: "active", expiresAt: now }, now).state, "expired");
  assert.equal(kioskTrustReadSummary({ ...base, status: "active" }, now).state, "provisioned_inactive");
  assert.equal(kioskTrustReadSummary({ ...base, status: "unknown" }, now).state, "pending");
});
test("R10-04: response is explicit whitelist and never echoes credentials", () => {
  const input = {
    status: "active", machineId: "37", expiresAt: future, revokedAt: null,
    refreshTokenHash: "secret-hash-must-not-appear",
    devicePublicKeySpki: "do-not-export-as-inventory",
    kioskUserId: "protected-account-id",
  };
  const payload = kioskTrustReadSummary(input, now);
  assert.deepEqual(Object.keys(payload).sort(), ["expiresAt", "machineId", "state"]);
  for (const key of ["refreshTokenHash", "devicePublicKeySpki", "kioskUserId"])
    assert.equal(key in payload, false);
});
