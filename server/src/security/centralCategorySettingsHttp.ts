import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import {
  AccessError, assertAndonSettingsOrPermission, assertFullMachineScope, assertModule,
  isAndonSettingsDelegate, type Principal,
} from "../access/policy.js";

// R12-04C/#368. Creation and editing only; DELETE keeps its separate legacy
// protection and is NOT implicitly enabled by either settings permission.
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_CATEGORY_SETTINGS_FLAG =
  "ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED";

export function centralCategorySettingsEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_CATEGORY_SETTINGS_FLAG] === "1";
}

export function isCentralCategorySettingsMutation(method: string, path: string) {
  return (method === "POST" && path === "/api/andon-categories") ||
    (method === "PATCH" && /^\/api\/andon-categories\/[a-z0-9_]{2,40}$/.test(path));
}

export function assertCentralCategorySettingsPrivilege(principal: Principal) {
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  // Explicit global ANDON settings delegation is role-agnostic, including
  // selected-machine human sessions; catalog-only users retain full-scope.
  if (!isAndonSettingsDelegate(principal)) assertFullMachineScope(principal);
  assertAndonSettingsOrPermission(principal, "catalog.reasons.manage");
}

export function markCentralCategorySettingsAuthorized(
  request: FastifyRequest,
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralCategorySettingsEnabled() ||
      !isCentralCategorySettingsMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralCategorySettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralCategorySettings(request: FastifyRequest) {
  return centralCategorySettingsEnabled() && authorized.has(request);
}
