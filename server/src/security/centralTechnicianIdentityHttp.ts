import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();

export function centralTechnicianIdentityEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_TECHNICIAN_IDENTITY_HTTP_ENABLED === "1";
}
export function isCentralTechnicianIdentityMutation(method: string, path: string) {
  return method === "POST" && path === "/api/technicians/identify";
}
export function assertCentralTechnicianIdentityPrivilege(principal: Principal) {
  if (principal.isPrimaryAdmin) {
    assertPermission(principal, "calls.attend");
    return;
  }
  if (!principal.permissions.includes("calls.attend") &&
      !principal.permissions.includes("calls.technicians.manage"))
    throw new AccessError("permission_denied");
  assertPermission(principal, principal.permissions.includes("calls.attend")
    ? "calls.attend" : "calls.technicians.manage");
}
export function markCentralTechnicianIdentityAuthorized(
  request: FastifyRequest,
  principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralTechnicianIdentityEnabled() ||
      !isCentralTechnicianIdentityMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertCentralTechnicianIdentityPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE),
      request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}
export function isAuthorizedCentralTechnicianIdentity(request: FastifyRequest) {
  return centralTechnicianIdentityEnabled() && authorized.has(request);
}
