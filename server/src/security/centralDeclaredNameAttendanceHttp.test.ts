import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralDeclaredNameAttendanceEnabled,
  isCentralDeclaredNameAttendanceMutation,
  parseDeclaredAttendanceBody,
  markCentralDeclaredNameAttendanceAuthorized,
  isAuthorizedCentralDeclaredNameAttendance,
} from "./centralDeclaredNameAttendanceHttp.js";

const token = "b".repeat(64);
const principal: Principal = {
  userId: "u", login: "operator", displayName: "Operator",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: "selected", machineIds: ["37"],
  permissions: ["andon.read", "calls.attend"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
function req(body: unknown = { technicianNames: ["Ana", "Bruna"] }, csrf = csrfToken(token)) {
  return {
    method: "PATCH", url: "/api/andon-calls/call_37/attend-declared",
    body, headers: {
      cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
    },
  } as unknown as FastifyRequest;
}
function denied(callback: () => unknown, code: string) {
  assert.throws(callback, (error: unknown) =>
    error instanceof AccessError && error.code === code);
}
const centralFlag = "ANDON_CENTRAL_ACCESS_ENABLED";
const declaredFlag = "ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED";
function restore(key: string, before: string | undefined) {
  if (before === undefined) delete process.env[key];
  else process.env[key] = before;
}

test("R12-02B1: independent declared-name policy is OFF by default", () => {
  const a = process.env[centralFlag], b = process.env[declaredFlag];
  try {
    process.env[centralFlag] = "1";
    delete process.env[declaredFlag];
    assert.equal(centralDeclaredNameAttendanceEnabled(), false);
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(), principal, station),
      "central_action_not_supported");
    process.env[centralFlag] = "0";
    process.env[declaredFlag] = "1";
    assert.equal(centralDeclaredNameAttendanceEnabled(), false);
    process.env[centralFlag] = "1";
    process.env[declaredFlag] = "1";
    assert.equal(centralDeclaredNameAttendanceEnabled(), true);
    assert.equal(isCentralDeclaredNameAttendanceMutation("PATCH",
      "/api/andon-calls/call_37/attend-declared"), true);
    for (const [method, path] of [
      ["POST", "/api/andon-calls/call_37/attend-declared"],
      ["PATCH", "/api/andon-calls/call_37/attend"],
      ["PATCH", "/api/andon-calls/call_37/technicians"],
      ["PATCH", "/api/andon-calls/../../attend-declared"],
    ]) assert.equal(isCentralDeclaredNameAttendanceMutation(method, path), false);
    const valid = req();
    markCentralDeclaredNameAttendanceAuthorized(valid, principal, station);
    assert.equal(isAuthorizedCentralDeclaredNameAttendance(valid), true);
    process.env[declaredFlag] = "0";
    assert.equal(isAuthorizedCentralDeclaredNameAttendance(valid), false);
  } finally {
    restore(centralFlag, a);
    restore(declaredFlag, b);
  }
});

test("R12-02B1: declaration requires human normal session, module grant, calls.attend and CSRF", () => {
  const a = process.env[centralFlag], b = process.env[declaredFlag];
  try {
    process.env[centralFlag] = "1";
    process.env[declaredFlag] = "1";
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(),
      { ...principal, accountType: "kiosk" }, station), "permission_denied");
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(),
      { ...principal, purpose: "password_change" }, station), "permission_denied");
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(),
      { ...principal, permissions: ["calls.attend"] }, station), "permission_denied");
    denied(() => markCentralDeclaredNameAttendanceAuthorized(req(
      { technicianNames: ["Ana"] }, "0".repeat(64)), principal, station), "csrf_denied");
    // Central module access belongs to the user, not the legacy station module toggle.
    const granted = req();
    markCentralDeclaredNameAttendanceAuthorized(
      granted, principal, { ...station, allowOperational: false });
    assert.equal(isAuthorizedCentralDeclaredNameAttendance(granted), true);
  } finally {
    restore(centralFlag, a);
    restore(declaredFlag, b);
  }
});

test("R12-02B1: strict body rejects credentials, claimed actor, arbitrary IDs and extras", () => {
  for (const body of [
    {}, [], null, "Ana", { names: ["Ana"] }, { technicianNames: [] },
    { technicianNames: ["Ana"], credentials: [{ method: "pin", value: "1234" }] },
    { technicianNames: ["Ana"], declaredBy: "administrator" },
    { technicianNames: ["Ana"], workstationId: "foreign" },
    { technicianNames: ["Ana"], identityVerified: true },
    { technicianNames: ["Ana", "ANA"] },
  ]) denied(() => parseDeclaredAttendanceBody(body), "technician_names_invalid");
  assert.deepEqual(parseDeclaredAttendanceBody({
    technicianNames: [" Ana ", "Bruna"],
  }), ["Ana", "Bruna"]);
});
