import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertFullMachineScope, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_OPERATIONAL_SETTINGS_FLAG = "ANDON_CENTRAL_OPERATIONAL_SETTINGS_HTTP_ENABLED";
export function centralOperationalSettingsEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_OPERATIONAL_SETTINGS_FLAG] === "1";
}
export function isCentralOperationalSettingsMutation(method: string, path: string) {
  return method === "PATCH" && path === "/api/system-settings";
}
const MANAGER_PRESENTATION_FIELDS = new Set([
  "virtualKeyboardEnabled", "dashboardMachineOrderMode",
]);

export function assertCentralOperationalSettingsPrivilege(principal: Principal, patch?: unknown) {
  if (principal.purpose !== "normal") throw new AccessError("permission_denied");
  assertFullMachineScope(principal);
  if (principal.isPrimaryAdmin) return;
  // Field-specific grant: a Manager cannot modify OS requirements, completion
  // restrictions, identities, RFID, policies or client credentials.
  assertPermission(principal, "hub.settings.presentation.write");
  if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
      !Object.keys(patch).length ||
      Object.keys(patch).some(key => !MANAGER_PRESENTATION_FIELDS.has(key)))
    throw new AccessError("permission_denied");
}
export function markCentralOperationalSettingsAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralOperationalSettingsEnabled() ||
      !isCentralOperationalSettingsMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralOperationalSettingsPrivilege(principal, request.body);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralOperationalSettings(request: FastifyRequest) {
  return centralOperationalSettingsEnabled() && authorized.has(request);
}
