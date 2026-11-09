import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { parseDeclaredTechnicianNames } from "../access/centralDeclaredNameVerification.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";
import { centralDeclaredNameAttendanceEnabled } from "./centralDeclaredNameAttendanceHttp.js";

// R12-02D / #345: an EXTRA independent gate for adding an UNVERIFIED declared
// name to an already active call. Disabled by default, even when the initial
// name-attendance route has been explicitly enabled.
const authorizedRequests = new WeakSet<FastifyRequest>();
export const CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_FLAG =
  "ANDON_CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_HTTP_ENABLED";

export function centralDeclaredNameTechnicianAddEnabled() {
  return centralDeclaredNameAttendanceEnabled() &&
    process.env[CENTRAL_DECLARED_NAME_TECHNICIAN_ADD_FLAG] === "1";
}

export function isCentralDeclaredNameTechnicianAddMutation(method: string, path: string) {
  return method === "POST" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/technicians-declared$/.test(path);
}

export function parseDeclaredTechnicianAddBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("technician_names_invalid", 400);
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "technicianNames")
    throw new AccessError("technician_names_invalid", 400);
  return parseDeclaredTechnicianNames((body as Record<string, unknown>).technicianNames);
}

/** Called only after the central HTTPS+Origin+session+workstation preflight. */
export function markCentralDeclaredNameTechnicianAddAuthorized(
  request: FastifyRequest,
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralDeclaredNameTechnicianAddEnabled() ||
      !isCentralDeclaredNameTechnicianAddMutation(
        request.method, request.url.split("?", 1)[0] ?? "",
      )) throw new AccessError("central_action_not_supported");
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  assertModule(principal, station, "operational");
  assertPermission(principal, "calls.technicians.manage");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  parseDeclaredTechnicianAddBody(request.body);
  authorizedRequests.add(request);
}

export function isAuthorizedCentralDeclaredNameTechnicianAdd(request: FastifyRequest) {
  return centralDeclaredNameTechnicianAddEnabled() && authorizedRequests.has(request);
}
