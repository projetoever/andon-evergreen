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
    /^\/api\/machines\/[^/]+$/.test(pathname)
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

/** Bind full and restricted users only after HTTPS, Origin and module checks. */
export function bindAuthorizedMachineReadPrincipal(
  request: FastifyRequest,
  principal: Principal,
) {
  if (principal.purpose !== "normal") throw new AccessError("password_change_required");
  scopedPrincipals.set(request, principal);
}
