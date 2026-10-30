import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { csrfToken } from "../access/credentials.js";
import { AccessError, type Principal } from "../access/policy.js";
import {
  centralOwnWorkstationPreferencesEnabled,
  classifyCentralOwnWorkstationPreference,
  centralOwnWorkstationPreferenceReadTarget,
  markCentralOwnWorkstationPreferenceAuthorized,
  isAuthorizedCentralOwnWorkstationPreference,
} from "./centralOwnWorkstationPrefsHttp.js";

const stationId = "ws_00000000-0000-4000-8000-000000000001";
const foreignId = "ws_00000000-0000-4000-8000-000000000002";
const token = "a".repeat(64);
const principal: Principal = {
  userId: "u", login: "operator", displayName: "Operator", roleLabel: "Produção",
  accountType: "person", isPrimaryAdmin: false, machineScope: "selected",
  machineIds: ["M37"], permissions: ["andon.read"],
  sessionId: "s", workstationId: stationId, purpose: "normal",
  authenticatedAt: new Date(),
};
const station = { allowOperational: true, allowBi: false, allowPriorities: false };
const request = (path: string, csrf = csrfToken(token), method = "PATCH") => ({
  method, url: path,
  headers: { cookie: "__Host-andon-access=" + token, "x-andon-csrf": csrf },
}) as unknown as FastifyRequest;

test("own kiosk preferences require explicit flag, exact self workstation and CSRF", () => {
  const orig = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const flag = process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED;
  try {
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
    process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "1";
    assert.equal(centralOwnWorkstationPreferencesEnabled(), false);
    process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
    process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "0";
    assert.equal(centralOwnWorkstationPreferencesEnabled(), false);
    process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "1";
    assert.equal(centralOwnWorkstationPreferencesEnabled(), true);
    const lock = "/api/workstations/" + stationId + "/screen-lock";
    const sound = "/api/workstations/" + stationId + "/machine-sound/M37";
    const other = "/api/workstations/" + foreignId + "/screen-lock";
    assert.equal(classifyCentralOwnWorkstationPreference("PATCH",lock)?.action,"screen-lock");
    assert.equal(classifyCentralOwnWorkstationPreference("PUT",sound)?.action,"machine-sound");
    assert.equal(classifyCentralOwnWorkstationPreference("PATCH",sound),null);
    assert.equal(classifyCentralOwnWorkstationPreference("PUT",lock),null);
    assert.equal(classifyCentralOwnWorkstationPreference("PATCH", "/api/workstations/"+stationId),null);
    assert.equal(centralOwnWorkstationPreferenceReadTarget("GET",
      "/api/workstations/"+stationId+"/runtime-preferences"),stationId);
    assert.equal(centralOwnWorkstationPreferenceReadTarget("PATCH",
      "/api/workstations/"+stationId+"/runtime-preferences"),null);
    assert.throws(() => markCentralOwnWorkstationPreferenceAuthorized(request(other),principal,station),
      (e: unknown) => e instanceof AccessError && e.code === "workstation_scope_denied");
    assert.throws(() => markCentralOwnWorkstationPreferenceAuthorized(request(lock,"0".repeat(64)),principal,station),
      (e: unknown) => e instanceof AccessError && e.code === "csrf_denied");
    assert.throws(() => markCentralOwnWorkstationPreferenceAuthorized(request(lock),
      {...principal,permissions:[]},station),
      (e: unknown) => e instanceof AccessError && e.code === "permission_denied");
    assert.throws(() => markCentralOwnWorkstationPreferenceAuthorized(request(lock),principal,
      {...station,allowOperational:false}),
      (e: unknown) => e instanceof AccessError && e.code === "workstation_module_denied");
    const ok = request(lock);
    markCentralOwnWorkstationPreferenceAuthorized(ok,principal,station);
    assert.equal(isAuthorizedCentralOwnWorkstationPreference(ok),true);
    process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED = "0";
    assert.equal(isAuthorizedCentralOwnWorkstationPreference(ok),false);
  } finally {
    if(orig===undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED=orig;
    if(flag===undefined) delete process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED;
    else process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED=flag;
  }
});
