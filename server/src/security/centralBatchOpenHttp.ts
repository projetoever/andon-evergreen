import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import { AccessError, assertModule, assertPermission, type Principal } from "../access/policy.js";

const authorized = new WeakSet<FastifyRequest>();
export function centralBatchOpenEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_BATCH_OPEN_HTTP_ENABLED === "1";
}
export function isCentralBatchOpenMutation(method: string, path: string) {
  return method === "POST" && path === "/api/andon-calls/batch";
}
export function markCentralBatchOpenAuthorized(
  req: FastifyRequest, principal: Principal,
  station: { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean },
) {
  const path = req.url.split("?", 1)[0] ?? "";
  if (!centralBatchOpenEnabled() || !isCentralBatchOpenMutation(req.method, path))
    throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  assertPermission(principal, "calls.open");
  if (!checkCsrf(readSecureCookie(req, ACCESS_COOKIE), req.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  authorized.add(req);
}
export function isAuthorizedCentralBatchOpen(req: FastifyRequest) {
  return centralBatchOpenEnabled() && authorized.has(req);
}
