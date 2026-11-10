import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import { registerCallReasonRoutes } from "../routes/callReasons.js";
import {
  authorizeCentralCallReasonRead, centralCallReasonsHttpEnabled,
  isAuthorizedCentralCallReasonRead, isAuthorizedCentralCallReasonRequest,
  isCentralCallReasonRead, isCentralCallReasonWrite,
  markCentralCallReasonAuthorized,
} from "./centralCallReasonsHttp.js";

const token = "b".repeat(64);
const admin: Principal = {
  userId: "admin", login: "admin", displayName: "Admin",
  roleLabel: "Admin", accountType: "person", isPrimaryAdmin: true,
  machineScope: "all", machineIds: [],
  permissions: ["andon.read", "catalog.reasons.manage", "analytics.policy.manage"],
  sessionId: "session", workstationId: "station",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: true, allowPriorities: true };
const fake = (method: string, url: string, csrf = csrfToken(token)) => ({
  method, url, headers: {
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrf,
  },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("R6/S2: feature gate is OFF unless both central and independent flag are ON", () => {
  const a = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const b = process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
    assert.equal(centralCallReasonsHttpEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "0";
    assert.equal(centralCallReasonsHttpEnabled(), false);
    denied(() => markCentralCallReasonAuthorized(fake("POST", "/api/call-reasons"), admin, station), "central_action_not_supported");
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
    assert.equal(centralCallReasonsHttpEnabled(), true);
  } finally {
    if (a === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = a;
    if (b === undefined) delete process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = b;
  }
});

test("R6/S2: only exact GET/POST/PATCH catalog methods are authorized", () => {
  assert.equal(isCentralCallReasonRead("GET", "/api/call-reasons"), true);
  for (const path of ["/api/call-reasons/abc", "/api/andon-categories", "/api/call-reasons/malicious"])
    assert.equal(isCentralCallReasonRead("GET", path), false);
  for (const [method, path] of [
    ["POST", "/api/call-reasons"],
    ["PATCH", "/api/call-reasons/maintenance"],
    ["POST", "/api/call-reasons/maintenance/options"],
    ["PATCH", "/api/call-reasons/maintenance/options/option_01"],
  ]) assert.equal(isCentralCallReasonWrite(method, path), true, path);
  for (const [method, path] of [
    ["DELETE", "/api/call-reasons"],
    ["PUT", "/api/call-reasons/maintenance"],
    ["PATCH", "/api/call-reasons/../options"],
    ["POST", "/api/call-reasons/maintenance/options/option_01"],
    ["POST", "/api/andon-calls"],
    ["PATCH", "/api/call-reasons/maintenance/options/../../etc"],
  ]) assert.equal(isCentralCallReasonWrite(method, path), false, method + " " + path);
});

test("R6/S2: permissions, primary Admin, machine scope, module, CSRF and marker are fail closed", () => {
  const a = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const b = process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "1";
  try {
    const w = fake("POST", "/api/call-reasons");
    denied(() => markCentralCallReasonAuthorized(w, { ...admin, machineScope: "selected" }, station), "scoped_query_required");
    denied(() => markCentralCallReasonAuthorized(w, { ...admin, isPrimaryAdmin: false }, station), "primary_admin_required");
    // Primary Admin is a deliberate superuser in the existing access model:
    // assertPermission() grants all permissions to isPrimaryAdmin=true.
    // Check explicit-grant failures on a nonprimary account instead.
    denied(() => markCentralCallReasonAuthorized(w, {
      ...admin, isPrimaryAdmin: false, permissions: ["andon.read"],
    }, station), "permission_denied");
    denied(() => markCentralCallReasonAuthorized(w, {
      ...admin, isPrimaryAdmin: false, permissions: ["andon.read", "catalog.reasons.manage"],
    }, station), "primary_admin_required");
    denied(() => markCentralCallReasonAuthorized(w, { ...admin, purpose: "password_change" }, station), "password_change_required");
    // Current central-mode contract delegates module rights to the user;
    // legacy workstation allowOperational is not an auth source here.
    assert.doesNotThrow(() => markCentralCallReasonAuthorized(
      fake("POST", "/api/call-reasons"), admin,
      { ...station, allowOperational: false },
    ));
    denied(() => markCentralCallReasonAuthorized(fake("POST", "/api/call-reasons", "0".repeat(64)), admin, station), "csrf_denied");
    assert.equal(isAuthorizedCentralCallReasonRequest(w), false);
    markCentralCallReasonAuthorized(w, admin, station);
    assert.equal(isAuthorizedCentralCallReasonRequest(w), true);
    const read = fake("GET", "/api/call-reasons");
    assert.equal(isAuthorizedCentralCallReasonRead(read), false);
    denied(() => authorizeCentralCallReasonRead(read, { ...admin, machineScope: "selected" }, station), "scoped_query_required");
    authorizeCentralCallReasonRead(read, admin, station);
    assert.equal(isAuthorizedCentralCallReasonRead(read), true);
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralCallReasonRead(read), false);
    assert.equal(isAuthorizedCentralCallReasonRequest(w), false);
  } finally {
    if (a === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = a;
    if (b === undefined) delete process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED = b;
  }
});

test("R6/S2: standalone route never reads or writes database without trusted markers", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  registerCallReasonRoutes(app);
  for (const { method, url, payload } of [
    { method: "GET", url: "/api/call-reasons" },
    { method: "POST", url: "/api/call-reasons", payload: { id: "setup" } },
    { method: "PATCH", url: "/api/call-reasons/setup", payload: { expectedRevision: 1 } },
    { method: "POST", url: "/api/call-reasons/setup/options", payload: { id: "mech" } },
    { method: "PATCH", url: "/api/call-reasons/setup/options/mech", payload: { expectedRevision: 1 } },
  ]) {
    const res = await app.inject({ method: method as "GET" | "POST" | "PATCH", url, ...(payload ? { payload } : {}) });
    assert.equal(res.statusCode, 403, method + " " + url);
    assert.equal(res.json().error, "central_action_not_supported");
    assert.equal(res.headers["cache-control"], "no-store");
  }
});
