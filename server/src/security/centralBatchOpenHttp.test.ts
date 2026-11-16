import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralBatchOpenEnabled, isCentralBatchOpenMutation,
  markCentralBatchOpenAuthorized, isAuthorizedCentralBatchOpen,
} from "./centralBatchOpenHttp.js";
const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "operator", displayName: "Operator", roleLabel: "Produção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.open"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string) => ({
  method: "POST", url: "/api/andon-calls/batch",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (action: () => unknown, code: string) =>
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);
test("multi-sector central opening is a distinct opt-in action with CSRF and permission", () => {
  const base = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = "1";
    assert.equal(centralBatchOpenEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = "0";
    assert.equal(centralBatchOpenEnabled(), false);
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = "1";
    assert.equal(isCentralBatchOpenMutation("POST", "/api/andon-calls/batch"), true);
    for (const [method, path] of [
      ["POST", "/api/andon-calls"], ["POST", "/api/andon-calls/batch/more"],
      ["PATCH", "/api/andon-calls/batch"],
    ]) assert.equal(isCentralBatchOpenMutation(method,path), false);
    denied(() => markCentralBatchOpenAuthorized(req("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralBatchOpenAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    assert.doesNotThrow(() => markCentralBatchOpenAuthorized(req(csrfToken(token)),
      principal, { ...station, allowOperational: false }));
    const request = req(csrfToken(token));
    markCentralBatchOpenAuthorized(request, principal, station);
    assert.equal(isAuthorizedCentralBatchOpen(request), true);
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralBatchOpen(request), false);
  } finally {
    if (base === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = base;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = flag;
  }
});

test("REFINE22.2: group batch requires hierarchical flag, central access, valid CSRF and calls.open", () => {
  const before = {
    central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
    generic: process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED,
    catalog: process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED,
    hierarchy: process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED,
  };
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED = "0";
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
    process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED = "0";
    const reqWithGroup = (csrf: string) => ({
      ...req(csrf),
      body: { machineId: "M37", subtypes: ["electrical", "mechanical"],
        reasonSelections: [] },
    }) as unknown as FastifyRequest;
    denied(() => markCentralBatchOpenAuthorized(reqWithGroup(csrfToken(token)),
      principal, station), "central_action_not_supported");
    process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED = "1";
    denied(() => markCentralBatchOpenAuthorized(reqWithGroup("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralBatchOpenAuthorized(reqWithGroup(csrfToken(token)),
      { ...principal, permissions: ["andon.read"] }, station), "permission_denied");
    const allowed = reqWithGroup(csrfToken(token));
    markCentralBatchOpenAuthorized(allowed, principal, station);
    assert.equal(isAuthorizedCentralBatchOpen(allowed), true);
    process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED = "0";
    assert.equal(isAuthorizedCentralBatchOpen(allowed), false);
  } finally {
    const restore = (key: string, value: string | undefined) =>
      value === undefined ? delete process.env[key] : process.env[key] = value;
    restore("ANDON_CENTRAL_ACCESS_ENABLED", before.central);
    restore("ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED", before.generic);
    restore("ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED", before.catalog);
    restore("ANDON_HIERARCHICAL_CALL_OPEN_ENABLED", before.hierarchy);
  }
});
