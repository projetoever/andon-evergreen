import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralCancelCallEnabled, isCentralCancelCallMutation,
  markCentralCancelCallAuthorized, isAuthorizedCentralCancelCall,
} from "./centralCancelCallHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "owner", displayName: "Owner", roleLabel: "Produção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.cancel.own"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string) => ({
  method: "PATCH", url: "/api/andon-calls/call_1/cancel",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);
test("central cancellation requires independent flag, own/any privilege and CSRF", () => {
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED = "1";
    assert.equal(centralCancelCallEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED = "0";
    assert.equal(centralCancelCallEnabled(), false);
    process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED = "1";
    assert.equal(isCentralCancelCallMutation("PATCH", "/api/andon-calls/id/cancel"), true);
    for (const [m,p] of [
      ["GET","/api/andon-calls/id/cancel"], ["POST","/api/andon-calls"],
      ["PATCH","/api/andon-calls/id/finish"], ["PATCH","/api/andon-calls/id/cancel/more"],
    ]) assert.equal(isCentralCancelCallMutation(m,p), false);
    denied(() => markCentralCancelCallAuthorized(req("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralCancelCallAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralCancelCallAuthorized(req(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const request = req(csrfToken(token));
    markCentralCancelCallAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralCancelCall(request), true);
    markCentralCancelCallAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read", "calls.cancel.any"] }, station);
    process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralCancelCall(request), false);
  } finally {
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CANCEL_CALL_HTTP_ENABLED = flag;
  }
});
