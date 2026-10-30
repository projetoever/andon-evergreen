import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorizedRequests = new WeakSet<FastifyRequest>();

/** A separate, OFF-by-default gate. Never broadens other technician mutations. */
export function centralTechnicianEndEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_TECHNICIAN_END_HTTP_ENABLED === "1";
}

export function isCentralTechnicianEndMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/technicians\/end$/.test(path);
}

export function markCentralTechnicianEndAuthorized(
  request: FastifyRequest,
  principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralTechnicianEndEnabled() ||
      !isCentralTechnicianEndMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "calls.technicians.manage");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorizedRequests.add(request);
}

export function isAuthorizedCentralTechnicianEnd(request: FastifyRequest) {
  return centralTechnicianEndEnabled() && authorizedRequests.has(request);
}
