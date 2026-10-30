import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralTechnicianAddEnabled, isCentralTechnicianAddMutation,
  markCentralTechnicianAddAuthorized, isAuthorizedCentralTechnicianAdd,
} from "./centralTechnicianAddHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "maintainer", displayName: "Maintainer", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.technicians.manage"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const request = (csrf: string) => ({
  method: "POST", url: "/api/andon-calls/call_1/technicians",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("SEC-04/2M: addition requires independent flag, exact route, privilege and CSRF", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianAddEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "0";
    assert.equal(centralTechnicianAddEnabled(), false);
    process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianAddEnabled(), true);
    assert.equal(isCentralTechnicianAddMutation("POST", "/api/andon-calls/id/technicians"), true);
    for (const [method, path] of [
      ["GET", "/api/andon-calls/id/technicians"],
      ["PATCH", "/api/andon-calls/id/technicians"],
      ["PATCH", "/api/andon-calls/id/technicians/end"],
      ["POST", "/api/andon-calls/id/technicians/end"],
      ["POST", "/api/andon-calls/id/technicians/another"],
      ["POST", "/api/andon-calls/id/attend"],
    ]) assert.equal(isCentralTechnicianAddMutation(method, path), false);
    denied(() => markCentralTechnicianAddAuthorized(request("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralTechnicianAddAuthorized(request(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralTechnicianAddAuthorized(request(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const valid = request(csrfToken(token));
    markCentralTechnicianAddAuthorized(valid, principal, station);
    assert.equal(isAuthorizedCentralTechnicianAdd(valid), true);
    process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralTechnicianAdd(valid), false);
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED = flag;
  }
});
