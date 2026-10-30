import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralMaintenanceCompletionEnabled,
  isCentralMaintenanceCompletionMutation,
  markCentralMaintenanceCompletionAuthorized,
  isAuthorizedCentralMaintenanceCompletion,
} from "./centralMaintenanceCompletionHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "tech", displayName: "Maintenance", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["37"], permissions: ["andon.read", "calls.finishMaintenance"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string, method = "PATCH",
  url = "/api/andon-calls/call_1/finish-maintenance") =>
  ({ method, url, headers: {
    cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf,
  } }) as unknown as FastifyRequest;
const denied = (action: () => unknown, code: string) =>
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);
test("maintenance completion is OFF by default and only one route may opt in", () => {
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "1";
    assert.equal(centralMaintenanceCompletionEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "0";
    assert.equal(centralMaintenanceCompletionEnabled(), false);
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "1";
    assert.equal(centralMaintenanceCompletionEnabled(), true);
    assert.equal(isCentralMaintenanceCompletionMutation("PATCH",
      "/api/andon-calls/id/finish-maintenance"), true);
    for (const [method, path] of [
      ["POST", "/api/andon-calls"], ["PATCH", "/api/andon-calls/id/finish"],
      ["PATCH", "/api/andon-calls/id/return-to-maintenance"],
      ["PATCH", "/api/andon-calls/id/../finish-maintenance"],
      ["GET", "/api/andon-calls/id/finish-maintenance"],
    ]) assert.equal(isCentralMaintenanceCompletionMutation(method, path), false);
    denied(() => markCentralMaintenanceCompletionAuthorized(req("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralMaintenanceCompletionAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralMaintenanceCompletionAuthorized(req(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const request = req(csrfToken(token));
    assert.equal(isAuthorizedCentralMaintenanceCompletion(request), false);
    markCentralMaintenanceCompletionAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralMaintenanceCompletion(request), true);
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralMaintenanceCompletion(request), false);
  } finally {
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED = flag;
  }
});
