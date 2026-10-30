import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
/** Opt-in independent of every other operational or BI mutation. OFF by default. */
export function centralDiagnosisEditEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_DIAGNOSIS_EDIT_HTTP_ENABLED === "1";
}
export function isCentralDiagnosisEditMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/failure-details$/.test(path);
}
export function markCentralDiagnosisEditAuthorized(
  req: FastifyRequest, principal: Principal,
  workstation: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralDiagnosisEditEnabled() ||
      !isCentralDiagnosisEditMutation(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, "history.read");
  assertPermission(principal, "diagnosis.edit");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(req);
}
export function isAuthorizedCentralDiagnosisEdit(req: FastifyRequest) {
  return centralDiagnosisEditEnabled() && authorized.has(req);
}
