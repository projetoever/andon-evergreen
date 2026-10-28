import type { FastifyRequest } from "fastify";
import { centralAccessEnabled } from "../access/http.js";
import { AccessError, type Principal } from "../access/policy.js";

/**
 * Scoped user context is attached only by the server-side workstation
 * authorization hook, never by client-provided headers, cookies or params.
 */
const scopedPrincipals = new WeakMap<FastifyRequest, Principal>();

export function isScopedMachineReadRoute(method: string, pathname: string) {
  return (method === "GET" || method === "HEAD") && (
    pathname === "/api/machines" ||
    /^\/api\/machines\/[^/]+$/.test(pathname) ||
    pathname === "/api/andon-calls" ||
    pathname === "/api/andon-calls/history" ||
    pathname === "/api/dashboard-priority/order" ||
    pathname === "/api/analytics/filter-options"
  );
}

/**
 * Null means no user-scope filter: HTTP legacy mode, a validated service
 * identity, or an authorized full-machine-scope central user.
 *
 * A central restricted user MUST be bound by the authorization hook.
 * Fail closed if this helper is ever called without proper authorization.
 */
export function scopedMachineReadIds(request: FastifyRequest): readonly string[] | null {
  if (!centralAccessEnabled() || request.industrialService) return null;
  const principal = scopedPrincipals.get(request);
  if (!principal) {
    // Full-scope users also need explicit hook binding, otherwise a missing
    // auth check could silently turn into an unfiltered result.
    throw new AccessError("central_read_context_required");
  }
  return principal.machineScope === "all" ? null : principal.machineIds;
}

/**
 * The live call collection must never expose completed/cancelled records
 * to a central user without history.read, even if no status was requested.
 * Legacy callers and validated industrial services retain existing behavior.
 */
export function restrictCentralCallListToActive(request: FastifyRequest): boolean {
  if (!centralAccessEnabled() || request.industrialService) return false;
  const principal = scopedPrincipals.get(request);
  if (!principal) throw new AccessError("central_read_context_required");
  return !principal.isPrimaryAdmin && !principal.permissions.includes("history.read");
}

/** Bind full and restricted users only after HTTPS, Origin and module checks. */
export function bindAuthorizedMachineReadPrincipal(
  request: FastifyRequest,
  principal: Principal,
) {
  if (principal.purpose !== "normal") throw new AccessError("password_change_required");
  scopedPrincipals.set(request, principal);
}
