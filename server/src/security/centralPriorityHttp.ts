import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertFullMachineScope, assertModule, assertPermission,
  type Principal } from "../access/policy.js";

const validated = new WeakSet<FastifyRequest>();
export function centralPriorityHttpEnabled() {
  return centralAccessEnabled() && process.env.ANDON_CENTRAL_PRIORITY_HTTP_ENABLED === "1";
}
export function isCentralPriorityWrite(method: string, path: string) {
  return method === "PUT" && path === "/api/dashboard-priority/order";
}
/** Global guard validates HTTPS/Origin/cookie/device before invoking this. */
export function markCentralPriorityAuthorized(
  req: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralPriorityHttpEnabled() || !isCentralPriorityWrite(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "priorities");
  assertFullMachineScope(principal);
  assertPermission(principal, "priorities.write");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  validated.add(req);
}
export function isAuthorizedCentralPriorityRequest(req: FastifyRequest) {
  return centralPriorityHttpEnabled() && validated.has(req);
}
