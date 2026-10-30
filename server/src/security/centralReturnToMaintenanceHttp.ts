import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
export function centralReturnToMaintenanceEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_RETURN_MAINTENANCE_HTTP_ENABLED === "1";
}
export function isCentralReturnToMaintenanceMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/return-to-maintenance$/.test(path);
}
export function markCentralReturnToMaintenanceAuthorized(
  req: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralReturnToMaintenanceEnabled() ||
      !isCentralReturnToMaintenanceMutation(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertPermission(principal, "calls.returnToMaintenance");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(req);
}
export function isAuthorizedCentralReturnToMaintenance(req: FastifyRequest) {
  return centralReturnToMaintenanceEnabled() && authorized.has(req);
}
