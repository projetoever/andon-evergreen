import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralClassificationHttpEnabled, isAuthorizedCentralClassificationRequest,
  isCentralClassificationMutation, markCentralClassificationAuthorized,
} from "./centralClassificationHttp.js";

const token = "a".repeat(64);
const principal = {
  userId: "u", login: "manager", displayName: "Manager", roleLabel: "Gestor",
  accountType: "person", isPrimaryAdmin: false, machineScope: "all",
  machineIds: [], permissions: ["andon.read", "catalog.classifications.manage"],
  sessionId: "s", workstationId: "ws", purpose: "normal", authenticatedAt: new Date(),
} satisfies Principal;
const station = { allowOperational: true, allowBi: true, allowPriorities: true };
const fake = (csrf: string, method = "POST", path = "/api/failure-classifications") =>
  ({ method, url: path, headers: {
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrf,
  } }) as unknown as FastifyRequest;
function denied(callback: () => unknown, code: string) {
  assert.throws(callback, (e: unknown) => e instanceof AccessError && e.code === code);
}
test("SEC-04 classification HTTP opt-in is OFF unless central mode AND independent flag are set", () => {
  const c = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const h = process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "1";
    assert.equal(centralClassificationHttpEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "0";
    assert.equal(centralClassificationHttpEnabled(), false);
    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "1";
    assert.equal(centralClassificationHttpEnabled(), true);
    assert.equal(isCentralClassificationMutation("POST", "/api/failure-classifications"), true);
    assert.equal(isCentralClassificationMutation("PATCH", "/api/failure-classifications/abc_123"), true);
    for (const [method, path] of [
      ["DELETE", "/api/failure-classifications/id"],
      ["POST", "/api/andon-calls"],
      ["PATCH", "/api/failure-classifications/../test"],
      ["PATCH", "/api/failure-classifications/id/extra"],
      ["PATCH", "/api/machine-set-types/id"],
    ]) assert.equal(isCentralClassificationMutation(method, path), false);
  } finally {
    if (c === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = c;
    if (h === undefined) delete process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = h;
  }
});
test("SEC-04 central catalog marker requires actual session privileges, full scope and CSRF", () => {
  const c = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const h = process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "1";
  try {
    denied(() => markCentralClassificationAuthorized(fake("0".repeat(64)), principal, station), "csrf_denied");
    denied(() => markCentralClassificationAuthorized(fake(csrfToken(token)), {
      ...principal, machineScope: "selected",
    }, station), "scoped_query_required");
    denied(() => markCentralClassificationAuthorized(fake(csrfToken(token)), {
      ...principal, permissions: ["andon.read"],
    }, station), "permission_denied");
    denied(() => markCentralClassificationAuthorized(fake(csrfToken(token)), principal, {
      ...station, allowOperational: false,
    }), "workstation_module_denied");
    const request = fake(csrfToken(token));
    assert.equal(isAuthorizedCentralClassificationRequest(request), false);
    markCentralClassificationAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralClassificationRequest(request), true);
    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralClassificationRequest(request), false);
  } finally {
    if (c === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = c;
    if (h === undefined) delete process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED = h;
  }
});
