import type { FastifyRequest } from "fastify";
import { centralAccessEnabled, ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const validatedAttendanceRequests = new WeakSet<FastifyRequest>();

/** Explicit opt-in; absent on production installations. */
export function centralAttendanceHttpEnabled() {
  return centralAccessEnabled() && process.env.ANDON_CENTRAL_ATTENDANCE_HTTP_ENABLED === "1";
}

export function isCentralAttendanceMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/attend$/.test(path);
}

/** Called only after the global TLS/origin/central session/station guard. */
export function markCentralAttendanceAuthorized(
  request: FastifyRequest,
  principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralAttendanceHttpEnabled() || !isCentralAttendanceMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "calls.attend");
  // Selected machine scope is verified against the call's DB machineId
  // AGAIN inside the transaction, never from the body/URL alone.
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  validatedAttendanceRequests.add(request);
}

export function isAuthorizedCentralAttendanceRequest(request: FastifyRequest) {
  return centralAttendanceHttpEnabled() && validatedAttendanceRequests.has(request);
}
