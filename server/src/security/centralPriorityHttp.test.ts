import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import { centralPriorityHttpEnabled, isCentralPriorityWrite, markCentralPriorityAuthorized,
  isAuthorizedCentralPriorityRequest } from "./centralPriorityHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "manager", displayName: "Manager", roleLabel: "Gestor",
  accountType: "person", isPrimaryAdmin: false, machineScope: "all",
  machineIds: [], permissions: ["priorities.read", "priorities.write"],
  sessionId: "s", workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: false, allowBi: false, allowPriorities: true };
const fake = (csrf: string) => ({
  method: "PUT", url: "/api/dashboard-priority/order",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
function denies(fn: () => unknown, code: string) {
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);
}
test("Priority PUT is opt-in and requires an authenticated full-scope editor and CSRF", () => {
  const prev = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = "0";
    assert.equal(centralPriorityHttpEnabled(), false);
    denies(() => markCentralPriorityAuthorized(fake(csrfToken(token)), principal, station),
      "central_action_not_supported");
    process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = "1";
    assert.equal(centralPriorityHttpEnabled(), true);
    assert.equal(isCentralPriorityWrite("PUT", "/api/dashboard-priority/order"), true);
    for (const [method, path] of [["GET", "/api/dashboard-priority/order"],
      ["PATCH", "/api/dashboard-priority/access-policy"],
      ["PUT", "/api/dashboard-priority/credentials"],
      ["PUT", "/api/dashboard-priority/order/other"]])
      assert.equal(isCentralPriorityWrite(method, path), false);
    const request = fake(csrfToken(token));
    denies(() => markCentralPriorityAuthorized(fake("0".repeat(64)), principal, station),
      "csrf_denied");
    denies(() => markCentralPriorityAuthorized(request, { ...principal, machineScope: "selected" }, station),
      "scoped_query_required");
    denies(() => markCentralPriorityAuthorized(request, { ...principal,
      permissions: ["priorities.read"] }, station), "permission_denied");
    markCentralPriorityAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralPriorityRequest(request), true);
    process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralPriorityRequest(request), false);
  } finally {
    if (prev === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = prev;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED = flag;
  }
});
