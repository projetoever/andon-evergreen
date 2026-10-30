import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

const authorized = new WeakSet<FastifyRequest>();

/** A kiosk may change only its own operational view/sound preferences. */
export function centralOwnWorkstationPreferencesEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_OWN_WORKSTATION_PREFS_HTTP_ENABLED === "1";
}
export function classifyCentralOwnWorkstationPreference(method: string, path: string) {
  const screen = /^\/api\/workstations\/([^/]+)\/screen-lock$/.exec(path);
  if (method === "PATCH" && screen && parseWorkstationId(screen[1]))
    return { workstationId: parseWorkstationId(screen[1])!, action: "screen-lock" as const };
  const sound = /^\/api\/workstations\/([^/]+)\/machine-sound\/([^/]+)$/.exec(path);
  if (method === "PUT" && sound && parseWorkstationId(sound[1]) &&
      /^[a-zA-Z0-9_-]{1,160}$/.test(sound[2]))
    return { workstationId: parseWorkstationId(sound[1])!, action: "machine-sound" as const };
  return null;
}
export function isCentralOwnWorkstationPreference(method: string, path: string) {
  return classifyCentralOwnWorkstationPreference(method, path) !== null;
}
export function markCentralOwnWorkstationPreferenceAuthorized(
  req: FastifyRequest, principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const matched = classifyCentralOwnWorkstationPreference(
    req.method, req.url.split("?", 1)[0] ?? "");
  if (!centralOwnWorkstationPreferencesEnabled() || !matched)
    throw new AccessError("central_action_not_supported");
  if (matched.workstationId !== principal.workstationId)
    throw new AccessError("workstation_scope_denied");
  assertModule(principal, workstation, "operational");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(req);
}
export function isAuthorizedCentralOwnWorkstationPreference(req: FastifyRequest) {
  return centralOwnWorkstationPreferencesEnabled() && authorized.has(req);
}
