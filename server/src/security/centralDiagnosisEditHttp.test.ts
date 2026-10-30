import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralDiagnosisEditEnabled, isCentralDiagnosisEditMutation,
  markCentralDiagnosisEditAuthorized, isAuthorizedCentralDiagnosisEdit,
} from "./centralDiagnosisEditHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "maintenance", displayName: "Maintainer", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "history.read", "diagnosis.edit"],
  sessionId: "s", workstationId: "ws", purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf: string) => ({
  method: "PATCH", url: "/api/andon-calls/call_1/failure-details",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (fn: () => unknown, code: string) =>
  assert.throws(fn, (e: unknown) => e instanceof AccessError && e.code === code);

test("SEC-04/2N: diagnosis edit independently gated, exact route, dual permission and CSRF", () => {
  const original = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "1";
    assert.equal(centralDiagnosisEditEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "0";
    assert.equal(centralDiagnosisEditEnabled(), false);
    process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "1";
    assert.equal(centralDiagnosisEditEnabled(), true);
    assert.equal(isCentralDiagnosisEditMutation("PATCH", "/api/andon-calls/c/failure-details"), true);
    for (const [method,path] of [
      ["GET", "/api/andon-calls/c/failure-details"],
      ["PATCH", "/api/andon-calls/c/finish"],
      ["PATCH", "/api/andon-calls/c/technicians/end"],
      ["POST", "/api/andon-calls/c/failure-details"],
      ["PATCH", "/api/andon-calls/c/failure-details/edit"],
    ]) assert.equal(isCentralDiagnosisEditMutation(method,path), false);
    denied(() => markCentralDiagnosisEditAuthorized(req("0".repeat(64)), principal, station), "csrf_denied");
    denied(() => markCentralDiagnosisEditAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read", "diagnosis.edit"] }, station), "permission_denied");
    denied(() => markCentralDiagnosisEditAuthorized(req(csrfToken(token)),
      { ...principal, permissions: ["andon.read", "history.read"] }, station), "permission_denied");
    denied(() => markCentralDiagnosisEditAuthorized(req(csrfToken(token)),
      principal, { ...station, allowOperational: false }), "workstation_module_denied");
    const valid = req(csrfToken(token));
    markCentralDiagnosisEditAuthorized(valid, principal, station);
    assert.equal(isAuthorizedCentralDiagnosisEdit(valid), true);
    process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralDiagnosisEdit(valid), false);
  } finally {
    if (original === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = original;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED = flag;
  }
});
