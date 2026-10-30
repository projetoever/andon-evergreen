import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorizedRequests = new WeakSet<FastifyRequest>();

/** OFF by default even when overall central access is enabled. */
export function centralMaintenanceCompletionEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_MAINTENANCE_COMPLETION_HTTP_ENABLED === "1";
}
export function isCentralMaintenanceCompletionMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/finish-maintenance$/.test(path);
}
export function markCentralMaintenanceCompletionAuthorized(
  req: FastifyRequest, principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralMaintenanceCompletionEnabled() ||
      !isCentralMaintenanceCompletionMutation(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "calls.finishMaintenance");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorizedRequests.add(req);
}
export function isAuthorizedCentralMaintenanceCompletion(req: FastifyRequest) {
  return centralMaintenanceCompletionEnabled() && authorizedRequests.has(req);
}
