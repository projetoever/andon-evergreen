import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, type Principal } from "../access/policy.js";
import { assertCentralTechnicianCatalogPrivilege } from "./centralTechnicianCatalogHttp.js";

/** R12-04A / #368: independent OFF-by-default editing gate; not attendance. */
const authorized = new WeakSet<FastifyRequest>();
export const CENTRAL_TECHNICIAN_UPDATE_FLAG =
  "ANDON_CENTRAL_TECHNICIAN_UPDATE_HTTP_ENABLED";

export function centralTechnicianUpdateEnabled() {
  return centralAccessEnabled() && process.env[CENTRAL_TECHNICIAN_UPDATE_FLAG] === "1";
}

export function isCentralTechnicianUpdateMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/technicians\/[a-zA-Z0-9_-]{1,160}$/.test(path);
}

export function markCentralTechnicianUpdateAuthorized(
  request: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralTechnicianUpdateEnabled() ||
      !isCentralTechnicianUpdateMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  // Person + normal session; all roles with explicit andon.settings.open,
  // including machineScope=selected. No Hub/BI/physical privilege derived.
  assertCentralTechnicianCatalogPrivilege(principal);
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(request);
}

export function isAuthorizedCentralTechnicianUpdate(request: FastifyRequest) {
  return centralTechnicianUpdateEnabled() && authorized.has(request);
}
