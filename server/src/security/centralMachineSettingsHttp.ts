import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import {
  AccessError, assertFullMachineScope, assertModule, isAndonSettingsDelegate,
  type Principal,
} from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_MACHINE_SETTINGS_FLAG = "ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED";

/** OFF-by-default: only administrative machine METADATA, never machine status. */
export function centralMachineSettingsEnabled(): boolean {
  return centralAccessEnabled() && process.env[CENTRAL_MACHINE_SETTINGS_FLAG] === "1";
}
export function isCentralMachineSettingsMutation(method: string, path: string): boolean {
  return method === "PATCH" && /^\/api\/machines\/[a-zA-Z0-9_-]{1,160}$/.test(path);
}
export function assertCentralMachineSettingsPrivilege(principal: Principal) {
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  if (isAndonSettingsDelegate(principal)) return;
  if (!principal.isPrimaryAdmin) throw new AccessError("permission_denied");
  assertFullMachineScope(principal);
}
export function markCentralMachineSettingsAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralMachineSettingsEnabled() ||
      !isCentralMachineSettingsMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralMachineSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralMachineSettings(request: FastifyRequest) {
  return centralMachineSettingsEnabled() && authorized.has(request);
}
