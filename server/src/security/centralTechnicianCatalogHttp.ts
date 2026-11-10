import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import {
  AccessError, assertFullMachineScope, assertModule, assertPermission,
  isAndonSettingsDelegate, type Principal,
} from "../access/policy.js";

const approved = new WeakSet<FastifyRequest>();
export const CENTRAL_TECHNICIAN_CREATE_FLAG = "ANDON_CENTRAL_TECHNICIAN_CREATE_HTTP_ENABLED";

export function centralTechnicianCreateEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_TECHNICIAN_CREATE_FLAG] === "1";
}
export function isCentralTechnicianCreateMutation(method: string, path: string) {
  return method === "POST" && path === "/api/technicians";
}
/** Human-only catalog privilege; NOT credential identification or call attendance. */
export function assertCentralTechnicianCatalogPrivilege(principal: Principal) {
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  if (isAndonSettingsDelegate(principal)) return;
  if (!principal.isPrimaryAdmin) assertPermission(principal, "catalog.technicians.manage");
  assertFullMachineScope(principal);
}
export function markCentralTechnicianCreateAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralTechnicianCreateEnabled() ||
      !isCentralTechnicianCreateMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertCentralTechnicianCatalogPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  approved.add(request);
}
export function isAuthorizedCentralTechnicianCreate(request: FastifyRequest) {
  return centralTechnicianCreateEnabled() && approved.has(request);
}
