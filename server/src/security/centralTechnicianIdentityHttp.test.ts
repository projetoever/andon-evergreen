import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralTechnicianIdentityEnabled,
  isCentralTechnicianIdentityMutation,
  markCentralTechnicianIdentityAuthorized,
  isAuthorizedCentralTechnicianIdentity,
} from "./centralTechnicianIdentityHttp.js";

const token = "a".repeat(64);
const principal: Principal = {
  userId: "user", login: "user", displayName: "User", roleLabel: "Manutenção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read", "calls.attend"],
  sessionId: "session", workstationId: "ws_00000000-0000-4000-8000-000000000001",
  purpose: "normal", authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const req = (csrf = csrfToken(token)) => ({
  method: "POST", url: "/api/technicians/identify",
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;
const denied = (action: () => void, code: string) =>
  assert.throws(action, (e: unknown) => e instanceof AccessError && e.code === code);

test("SEC-04: technician preflight is exact, opt-in and requires a technical permission", () => {
  const central = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianIdentityEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "0";
    assert.equal(centralTechnicianIdentityEnabled(), false);
    process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "1";
    assert.equal(centralTechnicianIdentityEnabled(), true);
    assert.equal(isCentralTechnicianIdentityMutation("POST", "/api/technicians/identify"), true);
    for (const [m,path] of [["GET","/api/technicians/identify"],
      ["POST","/api/technicians"],["PATCH","/api/technicians/identify"],
      ["POST","/api/technicians/identify/other"]])
      assert.equal(isCentralTechnicianIdentityMutation(m,path), false);

    denied(() => markCentralTechnicianIdentityAuthorized(req("0".repeat(64)),
      principal, station), "csrf_denied");
    denied(() => markCentralTechnicianIdentityAuthorized(req(),
      {...principal,permissions:["andon.read"]},station), "permission_denied");
    denied(() => markCentralTechnicianIdentityAuthorized(req(),
      principal,{...station,allowOperational:false}), "workstation_module_denied");
    const manager = {...principal, permissions:["andon.read","calls.technicians.manage"]};
    markCentralTechnicianIdentityAuthorized(req(), manager, station);
    const ok = req();
    markCentralTechnicianIdentityAuthorized(ok, principal, station);
    assert.equal(isAuthorizedCentralTechnicianIdentity(ok), true);
    process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralTechnicianIdentity(ok), false);
  } finally {
    if (central === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = central;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED = flag;
  }
});
