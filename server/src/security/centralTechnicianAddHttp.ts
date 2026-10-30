import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const verifiedRequests = new WeakSet<FastifyRequest>();
export function centralTechnicianAddEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_TECHNICIAN_ADD_HTTP_ENABLED === "1";
}
export function isCentralTechnicianAddMutation(method: string, path: string) {
  return method === "POST" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/technicians$/.test(path);
}
export function markCentralTechnicianAddAuthorized(
  request: FastifyRequest,
  principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralTechnicianAddEnabled() ||
      !isCentralTechnicianAddMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "calls.technicians.manage");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  verifiedRequests.add(request);
}
export function isAuthorizedCentralTechnicianAdd(request: FastifyRequest) {
  return centralTechnicianAddEnabled() && verifiedRequests.has(request);
}
