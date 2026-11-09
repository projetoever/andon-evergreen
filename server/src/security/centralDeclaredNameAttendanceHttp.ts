import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { parseDeclaredTechnicianNames } from "../access/centralDeclaredNameVerification.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorizedRequests = new WeakSet<FastifyRequest>();
export const CENTRAL_DECLARED_NAME_ATTENDANCE_FLAG =
  "ANDON_CENTRAL_DECLARED_NAME_ATTENDANCE_HTTP_ENABLED";

/** Independent, OFF by default. Not included in the HML launcher's standard flags. */
export function centralDeclaredNameAttendanceEnabled() {
  return centralAccessEnabled() &&
    process.env[CENTRAL_DECLARED_NAME_ATTENDANCE_FLAG] === "1";
}

export function isCentralDeclaredNameAttendanceMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/attend-declared$/.test(path);
}

export function parseDeclaredAttendanceBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("technician_names_invalid", 400);
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== "technicianNames")
    throw new AccessError("technician_names_invalid", 400);
  return parseDeclaredTechnicianNames((body as Record<string, unknown>).technicianNames);
}

/** Called only AFTER global TLS, Origin, session and workstation admission. */
export function markCentralDeclaredNameAttendanceAuthorized(
  request: FastifyRequest,
  principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  if (!centralDeclaredNameAttendanceEnabled() ||
      !isCentralDeclaredNameAttendanceMutation(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_action_not_supported");
  if (principal.purpose !== "normal" || principal.accountType !== "person")
    throw new AccessError("permission_denied");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "calls.attend");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  parseDeclaredAttendanceBody(request.body);
  authorizedRequests.add(request);
}

export function isAuthorizedCentralDeclaredNameAttendance(request: FastifyRequest) {
  return centralDeclaredNameAttendanceEnabled() && authorizedRequests.has(request);
}
