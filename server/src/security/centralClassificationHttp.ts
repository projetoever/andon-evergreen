import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertFullMachineScope, assertModule, assertPermission, type Principal } from "../access/policy.js";

const validated = new WeakSet<FastifyRequest>();

/** Separate opt-in. On deployed installs this variable is unset (OFF). */
export function centralClassificationHttpEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_CLASSIFICATION_HTTP_ENABLED === "1";
}

export function isCentralClassificationMutation(method: string, path: string) {
  return (method === "POST" && path === "/api/failure-classifications") ||
    (method === "PATCH" && /^\/api\/failure-classifications\/[a-zA-Z0-9_-]{1,160}$/.test(path));
}

/**
 * Called ONLY after the global workstation guard validates HTTPS, Origin,
 * workstation and a current central session. Permission and scope are checked
 * here and AGAIN under user/workstation locks by the transaction adapter.
 */
export function markCentralClassificationAuthorized(
  request: FastifyRequest,
  principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!centralClassificationHttpEnabled() ||
      !isCentralClassificationMutation(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertFullMachineScope(principal);
  assertPermission(principal, "catalog.classifications.manage");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  validated.add(request);
}

/** An unregistered hook cannot accidentally bypass the legacy Admin guard. */
export function isAuthorizedCentralClassificationRequest(request: FastifyRequest) {
  return centralClassificationHttpEnabled() && validated.has(request);
}
