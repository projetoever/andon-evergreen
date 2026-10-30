import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralOpenCallEnabled, isCentralOpenCallMutation,
  markCentralOpenCallAuthorized, isAuthorizedCentralOpenCall,
} from "./centralOpenCallHttp.js";
const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "operator", displayName: "Operator", roleLabel: "Produção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.open"],
  sessionId: "s", workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string) => ({ method: "POST", url: "/api/andon-calls",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf } }) as unknown as FastifyRequest;
const denies = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);
test("central call opening is opt-in, scoped and CSRF-protected; batch stays denied", () => {
  const flag = process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED;
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "1";
    assert.equal(centralOpenCallEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "0";
    assert.equal(centralOpenCallEnabled(), false);
    process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "1";
    assert.equal(centralOpenCallEnabled(), true);
    assert.equal(isCentralOpenCallMutation("POST", "/api/andon-calls"), true);
    for (const [m, p] of [["POST","/api/andon-calls/batch"],["PATCH","/api/andon-calls"],
      ["POST","/api/andon-calls/123"],["DELETE","/api/andon-calls"]])
      assert.equal(isCentralOpenCallMutation(m,p), false);
    denies(() => markCentralOpenCallAuthorized(req("0".repeat(64)), principal, station),
      "csrf_denied");
    denies(() => markCentralOpenCallAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denies(() => markCentralOpenCallAuthorized(req(csrfToken(token)), principal,
      { ...station, allowOperational: false }), "workstation_module_denied");
    const request = req(csrfToken(token));
    markCentralOpenCallAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralOpenCall(request), true);
    process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralOpenCall(request), false);
  } finally {
    if (flag === undefined) delete process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OPEN_CALL_HTTP_ENABLED = flag;
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
  }
});
