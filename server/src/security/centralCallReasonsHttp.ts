import type { FastifyRequest } from "fastify";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { checkCsrf } from "../access/credentials.js";
import {
  AccessError, assertModule, assertFullMachineScope, assertPermission,
  isAndonSettingsDelegate, type Principal,
} from "../access/policy.js";
import { isReasonPresentationOnlyPatch } from "./callReasonPresentationPolicy.js";
import { isDelegatedReasonCreate } from "./callReasonDelegateCreate.js";

const validated = new WeakSet<FastifyRequest>();
const validatedReads = new WeakSet<FastifyRequest>();
const validatedOperationalReads = new WeakSet<FastifyRequest>();
const ID = "[a-z0-9_]{2,40}";

/** Independent feature gate, OFF on every existing installation by default. */
export function centralCallReasonsHttpEnabled() {
  return centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_CALL_REASONS_HTTP_ENABLED === "1";
}
export function isCentralCallReasonRead(method: string, path: string) {
  return method === "GET" && path === "/api/call-reasons";
}
/** Read-only catalog for authorized operators. This never delegates admin permissions. */
export function isCentralOperationalReasonRead(method: string, path: string) {
  return method === "GET" && path === "/api/call-reasons/operational";
}
export function authorizeCentralOperationalReasonRead(
  request: FastifyRequest, principal: Principal, station: Station,
) {
  if (!isCentralOperationalReasonRead(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_route_not_supported");
  if (!centralCallReasonsHttpEnabled() ||
      process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED !== "1")
    throw new AccessError("hierarchical_calls_disabled", 403);
  assertModule(principal, station, "operational");
  assertPermission(principal, "calls.open");
  validatedOperationalReads.add(request);
}
export function isAuthorizedCentralOperationalReasonRead(request: FastifyRequest) {
  return centralCallReasonsHttpEnabled() &&
    process.env.ANDON_HIERARCHICAL_CALL_OPEN_ENABLED === "1" &&
    validatedOperationalReads.has(request);
}
export function isCentralCallReasonWrite(method: string, path: string) {
  if (method === "POST" && path === "/api/call-reasons") return true;
  if (method === "PATCH" && new RegExp(`^/api/call-reasons/${ID}$`).test(path)) return true;
  if (method === "POST" && new RegExp(`^/api/call-reasons/${ID}/options$`).test(path)) return true;
  if (method === "PATCH" && new RegExp(`^/api/call-reasons/${ID}/options/${ID}$`).test(path)) return true;
  return false;
}
type Station = { allowOperational: boolean; allowBi: boolean; allowPriorities: boolean };

function assertReasonCatalogAccess(principal: Principal, station: Station) {
  if (!centralCallReasonsHttpEnabled()) throw new AccessError("central_action_not_supported");
  assertModule(principal, station, "operational");
  // Explicit ANDON settings delegates may read the global catalogue and
  // change only presentation fields; machine scope still limits operational
  // actions and does not become a broad privileged catalog grant.
  if (isAndonSettingsDelegate(principal)) return;
  assertFullMachineScope(principal);
  assertPermission(principal, "catalog.reasons.manage");
  if (!principal.isPrimaryAdmin) throw new AccessError("primary_admin_required");
}
export function authorizeCentralCallReasonRead(
  request: FastifyRequest, principal: Principal, station: Station,
) {
  if (!isCentralCallReasonRead(request.method, request.url.split("?", 1)[0] ?? ""))
    throw new AccessError("central_route_not_supported");
  assertReasonCatalogAccess(principal, station);
  validatedReads.add(request);
}
export function isAuthorizedCentralCallReasonRead(request: FastifyRequest) {
  return centralCallReasonsHttpEnabled() && validatedReads.has(request);
}
export function markCentralCallReasonAuthorized(
  request: FastifyRequest, principal: Principal, station: Station,
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!isCentralCallReasonWrite(request.method, path))
    throw new AccessError("central_action_not_supported");
  assertReasonCatalogAccess(principal, station);
  const presentationPatch = request.method === "PATCH" &&
    isReasonPresentationOnlyPatch(
      path.includes("/options/") ? "option.update" : "reason.update",
      request.body,
    );
  const conservativeCreate = request.method === "POST" &&
    path === "/api/call-reasons" && isDelegatedReasonCreate(request.body);
  if (!principal.isPrimaryAdmin && !presentationPatch && !conservativeCreate)
    throw new AccessError("primary_admin_required");
  if (principal.isPrimaryAdmin)
    assertPermission(principal, "analytics.policy.manage");
  if (!checkCsrf(readSecureCookie(request, ACCESS_COOKIE), request.headers["x-andon-csrf"]))
    throw new AccessError("csrf_denied");
  validated.add(request);
}
export function isAuthorizedCentralCallReasonRequest(request: FastifyRequest) {
  return centralCallReasonsHttpEnabled() && validated.has(request);
}
