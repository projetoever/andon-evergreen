import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertFullMachineScope, assertModule, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_OPERATIONAL_SETTINGS_FLAG = "ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED";
export function centralOperationalSettingsEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_OPERATIONAL_SETTINGS_FLAG] === "1";
}
export function isCentralOperationalSettingsMutation(method: string, path: string) {
  return method === "PATCH" && path === "/api/system-settings";
}
export function assertCentralOperationalSettingsPrivilege(principal: Principal) {
  if (principal.purpose !== "normal" || !principal.isPrimaryAdmin)
    throw new AccessError("permission_denied");
  assertFullMachineScope(principal);
}
export function markCentralOperationalSettingsAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralOperationalSettingsEnabled() ||
      !isCentralOperationalSettingsMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralOperationalSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralOperationalSettings(request: FastifyRequest) {
  return centralOperationalSettingsEnabled() && authorized.has(request);
}
