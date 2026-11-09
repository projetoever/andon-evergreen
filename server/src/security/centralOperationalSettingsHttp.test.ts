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
const req = (csrf = csrfToken(token), body: unknown = { virtualKeyboardEnabled: true }) => ({
  method: "PATCH", url: "/api/system-settings", body,
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
    assert.doesNotThrow(() => markCentralOperationalSettingsAuthorized(req(), admin,
      { ...station, allowOperational: false }));
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

test("Manager presentation grant permits only two safe fields, with flag, full scope, CSRF and transaction-time checks", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
  const manager = {
    ...admin, isPrimaryAdmin: false,
    roleLabel: "Gestor/Gerente",
    permissions: ["andon.read", "hub.settings.presentation.write"],
  };
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
    for (const body of [
      { virtualKeyboardEnabled: false },
      { dashboardMachineOrderMode: "priority" },
      { virtualKeyboardEnabled: true, dashboardMachineOrderMode: "default" },
    ]) {
      const request = req(csrfToken(token), body);
      markCentralOperationalSettingsAuthorized(request, manager, station);
      assert.equal(isAuthorizedCentralOperationalSettings(request), true);
    }
    for (const body of [
      {}, { requireWorkOrderAtOpen: false },
      { restrictMaintenanceCompletionToAttendanceWorkstation: false },
      { clientName: "Another brand" },
      { attendanceMode: "name" },
      { rfidReaderMode: "keyboard_hid" },
      { dashboardSoundMuted: true },
      { adminPasswordHash: "unsafe" },
      { virtualKeyboardEnabled: true, requireWorkOrderAtOpen: false },
    ]) {
      denied(() => markCentralOperationalSettingsAuthorized(req(csrfToken(token), body), manager, station), "permission_denied");
    }
    denied(() => markCentralOperationalSettingsAuthorized(req(), { ...manager, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralOperationalSettingsAuthorized(req(), { ...manager, machineScope: "selected" }, station), "scoped_query_required");
    denied(() => markCentralOperationalSettingsAuthorized(req("0".repeat(64)), manager, station), "csrf_denied");
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
    denied(() => markCentralOperationalSettingsAuthorized(req(), manager, station), "central_action_not_supported");
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = flag;
  }
});


test("R10-09: any HUMAN profile with explicit ANDON settings grant can configure the module", () => {
  const beforeCentral = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const beforeFlag = process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
    for (const roleLabel of ["Produção", "Manutenção", "Líder", "Gestor/Gerente", "Customizado"]) {
      const delegated: Principal = {
        ...admin, roleLabel, isPrimaryAdmin: false,
        machineScope: "selected", machineIds: ["37"],
        permissions: ["andon.read", "andon.settings.open"],
      };
      for (const body of [
        { requireWorkOrderAtOpen: true },
        { restrictMaintenanceCompletionToAttendanceWorkstation: true },
        { clientName: "Evergreen" },
        { attendanceMode: "pin" },
        { rfidReaderMode: "keyboard_hid" },
      ]) {
        const request = req(csrfToken(token), body);
        markCentralOperationalSettingsAuthorized(request, delegated, station);
        assert.equal(isAuthorizedCentralOperationalSettings(request), true);
      }
      denied(() => markCentralOperationalSettingsAuthorized(req(), {
        ...delegated, permissions: ["andon.read"],
      }, station), "scoped_query_required");
      denied(() => markCentralOperationalSettingsAuthorized(req(), {
        ...delegated, accountType: "kiosk",
      }, station), "permission_denied");
      denied(() => markCentralOperationalSettingsAuthorized(req(), {
        ...delegated, purpose: "password_change",
      }, station), "password_change_required");
      denied(() => markCentralOperationalSettingsAuthorized(req("0".repeat(64)), delegated, station), "csrf_denied");
    }
  } finally {
    if (beforeCentral === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = beforeCentral;
    if (beforeFlag === undefined) delete process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = beforeFlag;
  }
});


test("REFINE12 #345: name mode is writable only with two explicit OFF-by-default central flags", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const operational = process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
  const names = process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "1";
    process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "1";
    denied(() => parseCentralOperationalSettingsPatch({ attendanceMode: "name" }),
      "central_credential_required");
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "0";
    denied(() => parseCentralOperationalSettingsPatch({ attendanceMode: "name" }),
      "central_credential_required");
    process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = "1";
    assert.deepEqual(parseCentralOperationalSettingsPatch({ attendanceMode: "name" }),
      { attendanceMode: "name" });
    process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = "0";
    // Parsing may accept a proposed policy, but the route still cannot write it
    // without its separate config flag and user + workstation + CSRF privilege.
    denied(() => markCentralOperationalSettingsAuthorized(req(
      csrfToken(token), { attendanceMode: "name" }), admin, station),
      "central_action_not_supported");
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (operational === undefined) delete process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED = operational;
    if (names === undefined) delete process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED = names;
  }
});
