import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralOperationalSettingsEnabled,
  isCentralOperationalSettingsMutation,
  markCentralOperationalSettingsAuthorized,
  isAuthorizedCentralOperationalSettings,
} from "./centralOperationalSettingsHttp.js";
import {
  parseCentralOperationalSettingsPatch,
  CENTRAL_OPERATIONAL_SETTINGS_FIELDS,
} from "../access/centralOperationalSettings.js";

const token = "a".repeat(64);
const admin: Principal = {
  userId: "u", login: "admin", displayName: "Admin", roleLabel: "Admin",
  accountType: "person", isPrimaryAdmin: true, machineScope: "all",
  machineIds: [], permissions: ["andon.read"], sessionId: "s",
  workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "PATCH", url: "/api/system-settings",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (callback: () => unknown, code: string) =>
  assert.throws(callback, (error: unknown) =>
    error instanceof AccessError && error.code === code);

test("central system-settings requires explicitly enabled flag, primary Admin, all machines and CSRF", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
    assert.equal(centralOperationalSettingsEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(centralOperationalSettingsEnabled(), false);
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
    assert.equal(centralOperationalSettingsEnabled(), true);
    assert.equal(isCentralOperationalSettingsMutation("PATCH", "/api/system-settings"), true);
    assert.equal(isCentralOperationalSettingsMutation("PATCH", "/api/dashboard-sound-state"), false);
    assert.equal(isCentralOperationalSettingsMutation("PUT", "/api/system-settings"), false);
    denied(() => markCentralOperationalSettingsAuthorized(req(),
      { ...admin, isPrimaryAdmin: false }, station), "permission_denied");
    denied(() => markCentralOperationalSettingsAuthorized(req(),
      { ...admin, machineScope: "selected" }, station), "scoped_query_required");
    denied(() => markCentralOperationalSettingsAuthorized(req("0".repeat(64)),
      admin, station), "csrf_denied");
    denied(() => markCentralOperationalSettingsAuthorized(req(), admin,
      { ...station, allowOperational: false }), "workstation_module_denied");
    const request = req();
    markCentralOperationalSettingsAuthorized(request, admin, station);
    assert.equal(isAuthorizedCentralOperationalSettings(request), true);
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralOperationalSettings(request), false);
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = flag;
  }
});

test("operational settings strict whitelist excludes siren, global mute, credentials and unknown keys", () => {
  assert(CENTRAL_OPERATIONAL_SETTINGS_FIELDS.includes("requireWorkOrderAtOpen"));
  assert.deepEqual(parseCentralOperationalSettingsPatch({
    requireWorkOrderAtOpen: true, attendanceMode: "pin",
    clientName: "  Evergreen   ",
  }), { requireWorkOrderAtOpen: true, attendanceMode: "pin", clientName: "Evergreen" });
  for (const patch of [
    {}, null, [], { dashboardSoundMuted: true },
    { dashboardSoundMuteTimerEnabled: true }, { adminPasswordHash: "bad" },
    { requireWorkstationApproval: false }, { hubEnabled: true },
    { unknown: "x" }, { attendanceMode: "name" },
    { requireWorkOrderAtOpen: "true" }, { clientName: "" },
    { rfidInputTerminator: "shell" }, { rfidCodeLength: 900 },
  ]) {
    assert.throws(() => parseCentralOperationalSettingsPatch(patch));
  }
});
