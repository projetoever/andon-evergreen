import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, isAndonSettingsDelegate, type Principal } from "../access/policy.js";

// R12-04B / #368: shift configuration, not machine production scheduling.
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_SHIFT_UPDATE_FLAG = "ANDON_CENTRAL_SHIFT_UPDATE_HTTP_ENABLED";

export function centralShiftUpdateEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_SHIFT_UPDATE_FLAG] === "1";
}

export function isCentralShiftUpdateMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/shifts\/[a-zA-Z0-9_-]{1,160}$/.test(path);
}

export function assertCentralShiftSettingsPrivilege(principal: Principal) {
  if (principal.accountType !== "person" || principal.purpose !== "normal")
    throw new AccessError("permission_denied");
  // Global ANDON settings grant is independent of routine machine scope and
  // roleLabel. It grants neither Hub, BI nor a write to a live machine.
  if (principal.isPrimaryAdmin || isAndonSettingsDelegate(principal)) return;
  throw new AccessError("permission_denied");
}

export function markCentralShiftUpdateAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralShiftUpdateEnabled() ||
      !isCentralShiftUpdateMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralShiftSettingsPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralShiftUpdate(request: FastifyRequest) {
  return centralShiftUpdateEnabled() && authorized.has(request);
}
