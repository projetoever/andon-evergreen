import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralTechnicianEndEnabled, isCentralTechnicianEndMutation,
  markCentralTechnicianEndAuthorized, isAuthorizedCentralTechnicianEnd,
} from "./centralTechnicianEndHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "operator", displayName: "Operator", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.technicians.manage"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const request = (csrf: string) => ({
  method: "PATCH", url: "/api/andon-calls/call_1/technicians/end",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("SEC-04/2L: technician exit is independently gated and requires exact route, privilege and CSRF", () => {
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianEndEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "0";
    assert.equal(centralTechnicianEndEnabled(), false);
    process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianEndEnabled(), true);
    assert.equal(isCentralTechnicianEndMutation("PATCH", "/api/andon-calls/id/technicians/end"), true);
    for (const [method, path] of [
      ["GET", "/api/andon-calls/id/technicians/end"],
      ["PATCH", "/api/andon-calls/id/technicians/name/end"],
      ["POST", "/api/andon-calls/id/technicians"],
      ["PATCH", "/api/andon-calls/id/finish-maintenance"],
      ["PATCH", "/api/andon-calls/id/technicians/end/additional"],
    ]) assert.equal(isCentralTechnicianEndMutation(method, path), false);
    denied(() => markCentralTechnicianEndAuthorized(request("0".repeat(64)), principal, station), "csrf_denied");
    denied(() => markCentralTechnicianEndAuthorized(request(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralTechnicianEndAuthorized(request(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const ok = request(csrfToken(token));
    markCentralTechnicianEndAuthorized(ok, principal, station);
    assert.equal(isAuthorizedCentralTechnicianEnd(ok), true);
    process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralTechnicianEnd(ok), false);
  } finally {
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED = flag;
  }
});
