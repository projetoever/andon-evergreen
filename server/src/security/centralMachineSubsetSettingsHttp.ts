import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralMachineSetSettingsPrivilege } from "./centralMachineSetSettingsHttp.js";

// Separate flag from sets: no implicit enabling on a production machine and
// no permissions for deleting/reparenting assets or physical operations.
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_MACHINE_SUBSET_SETTINGS_FLAG =
  "ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED";

export function centralMachineSubsetSettingsEnabled() {
  return centralAccessEnabled() &&
    process.env[CENTRAL_MACHINE_SUBSET_SETTINGS_FLAG] === "1";
}

const ID = "[A-Za-z0-9_-]{1,160}";
export function isCentralMachineSubsetSettingsMutation(method: string, path: string) {
  return (method === "POST" &&
    new RegExp("^/api/machine-sets/" + ID + "/subsets$").test(path)) ||
    (method === "PATCH" &&
      new RegExp("^/api/machine-subsets/" + ID + "$").test(path));
}
export function isCentralMachineSubsetSettingsRead(method: string, path: string) {
  return method === "GET" &&
    (new RegExp("^/api/machine-sets/" + ID + "/subsets$").test(path) ||
      new RegExp("^/api/machine-subsets/" + ID + "$").test(path));
}

export function markCentralMachineSubsetSettingsAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineSubsetSettingsEnabled() ||
      !isCentralMachineSubsetSettingsMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSetSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralMachineSubsetSettings(request: FastifyRequest) {
  return centralMachineSubsetSettingsEnabled() && authorized.has(request);
}

export function authorizeCentralMachineSubsetSettingsRead(
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineSubsetSettingsEnabled())
    throw new AccessError("central_route_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSetSettingsPrivilege(principal);
}
