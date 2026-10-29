import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralAttendanceHttpEnabled, isCentralAttendanceMutation,
  markCentralAttendanceAuthorized, isAuthorizedCentralAttendanceRequest,
} from "./centralAttendanceHttp.js";

const token = "a".repeat(64);
const principal = {
  userId: "u", login: "tech", displayName: "Technician", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["37"], permissions: ["andon.read", "calls.attend"],
  sessionId: "s", workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
} satisfies Principal;
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const request = (csrf: string) => ({
  method: "PATCH", url: "/api/andon-calls/call_1/attend",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
function denied(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);
}
test("SEC-04: attendance is only one PATCH action under dual explicit flag", () => {
  const c = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const a = process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "0";
    assert.equal(centralAttendanceHttpEnabled(), false);
    denied(() => markCentralAttendanceAuthorized(request(csrfToken(token)), principal, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "1";
    assert.equal(centralAttendanceHttpEnabled(), true);
    assert.equal(isCentralAttendanceMutation("PATCH", "/api/andon-calls/call_1/attend"), true);
    for (const [method, path] of [
      ["POST", "/api/andon-calls"], ["PATCH", "/api/andon-calls/id/finish"],
      ["PATCH", "/api/andon-calls/id/finish-maintenance"],
      ["PATCH", "/api/andon-calls/id/../attend"],
    ]) assert.equal(isCentralAttendanceMutation(method, path), false);
    const valid = request(csrfToken(token));
    markCentralAttendanceAuthorized(valid, principal, station);
    assert.equal(isAuthorizedCentralAttendanceRequest(valid), true);
    denied(() => markCentralAttendanceAuthorized(request("0".repeat(64)), principal, station),
      "csrf_denied");
    denied(() => markCentralAttendanceAuthorized(valid,
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralAttendanceAuthorized(valid, principal,
      { ...station, allowOperational: false }), "workstation_module_denied");
    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralAttendanceRequest(valid), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = "1";
    assert.equal(centralAttendanceHttpEnabled(), false);
  } finally {
    if (c === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = c;
    if (a === undefined) delete process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED = a;
  }
});
