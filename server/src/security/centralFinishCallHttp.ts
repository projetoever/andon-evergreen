import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const approved = new WeakSet<FastifyRequest>();
export function centralFinishCallEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_FINISH_CALL_HTTP_ENABLED === "1";
}
export function isCentralFinishCallMutation(method: string, path: string) {
  return method === "PATCH" &&
    /^\/api\/andon-calls\/[a-zA-Z0-9_-]{1,160}\/finish$/.test(path);
}
export function markCentralFinishCallAuthorized(
  req: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralFinishCallEnabled() || !isCentralFinishCallMutation(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertPermission(principal, "calls.finish");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  approved.add(req);
}
export function isAuthorizedCentralFinishCall(req: FastifyRequest) {
  return centralFinishCallEnabled() && approved.has(req);
}
