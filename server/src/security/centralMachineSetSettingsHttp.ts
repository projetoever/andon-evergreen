import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import {
  AccessError, assertAndonSettingsOrPermission, assertFullMachineScope,
  assertModule, isAndonSettingsDelegate, type Principal,
} from "../access/policy.js";

// REFINE12/#368. Deliberately independent of category, shift and asset-type
// flags. Only POST set and PATCH set are admitted. DELETE is never covered.
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_MACHINE_SET_SETTINGS_FLAG =
  "ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED";

export function centralMachineSetSettingsEnabled() {
  return centralAccessEnabled() &&
    process.env[CENTRAL_MACHINE_SET_SETTINGS_FLAG] === "1";
}

const SET_ID = "[A-Za-z0-9_-]{1,160}";

export function isCentralMachineSetSettingsMutation(method: string, path: string) {
  return (method === "POST" &&
    new RegExp("^/api/machines/" + SET_ID + "/sets$").test(path)) ||
    (method === "PATCH" &&
      new RegExp("^/api/machine-sets/" + SET_ID + "$").test(path));
}

export function isCentralMachineSetSettingsRead(method: string, path: string) {
  return method === "GET" &&
    (new RegExp("^/api/machines/" + SET_ID + "/sets$").test(path) ||
      new RegExp("^/api/machine-sets/" + SET_ID + "$").test(path));
}

export function assertCentralMachineSetSettingsPrivilege(principal: Principal) {
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  // Explicit global ANDON config authority can cross the user's operational
  // machine filter ONLY on this catalog surface. Catalog-only roles still
  // require full machine scope and cannot escalate to live machine actions.
  if (!isAndonSettingsDelegate(principal)) assertFullMachineScope(principal);
  assertAndonSettingsOrPermission(principal, "catalog.assets.manage");
}

export function markCentralMachineSetSettingsAuthorized(
  request: FastifyRequest,
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralMachineSetSettingsEnabled() ||
      !isCentralMachineSetSettingsMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSetSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralMachineSetSettings(request: FastifyRequest) {
  return centralMachineSetSettingsEnabled() && authorized.has(request);
}

export function authorizeCentralMachineSetSettingsRead(
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineSetSettingsEnabled())
    throw new AccessError("central_route_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSetSettingsPrivilege(principal);
}
