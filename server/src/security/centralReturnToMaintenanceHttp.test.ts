import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralReturnToMaintenanceEnabled, isCentralReturnToMaintenanceMutation,
  markCentralReturnToMaintenanceAuthorized, isAuthorizedCentralReturnToMaintenance,
} from "./centralReturnToMaintenanceHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "tech", displayName: "Technician", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["37"], permissions: ["andon.read", "calls.returnToMaintenance"],
  sessionId: "s", workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string) => ({
  method: "PATCH", url: "/api/andon-calls/call_1/return-to-maintenance",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("return-to-maintenance only enables with dual flag and rejects other methods/routes", () => {
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "1";
    assert.equal(centralReturnToMaintenanceEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "0";
    assert.equal(centralReturnToMaintenanceEnabled(), false);
    process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "1";
    assert.equal(isCentralReturnToMaintenanceMutation("PATCH",
      "/api/andon-calls/call_1/return-to-maintenance"), true);
    for (const [method, path] of [
      ["PATCH", "/api/andon-calls/id/finish"], ["POST", "/api/andon-calls"],
      ["PATCH", "/api/andon-calls/id/finish-maintenance"],
      ["PATCH", "/api/andon-calls/id/../return-to-maintenance"],
    ]) assert.equal(isCentralReturnToMaintenanceMutation(method, path), false);
    denied(() => markCentralReturnToMaintenanceAuthorized(req("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralReturnToMaintenanceAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    denied(() => markCentralReturnToMaintenanceAuthorized(req(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const request = req(csrfToken(token));
    assert.equal(isAuthorizedCentralReturnToMaintenance(request), false);
    markCentralReturnToMaintenanceAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralReturnToMaintenance(request), true);
    process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralReturnToMaintenance(request), false);
  } finally {
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED = flag;
  }
});
