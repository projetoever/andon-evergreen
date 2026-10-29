import { classifyCentralRouteAction } from "./centralActionRegistry.js";
import {
  AccessError, assertFullMachineScope, assertModule, assertPermission,
  type Principal, type Permission,
} from "./policy.js";

export type GlobalCatalogWriteInput = {
  principal: Principal;
  workstation: {
    id: string; active: boolean; pendingApproval?: boolean;
    allowOperational: boolean; allowBi: boolean; allowPriorities: boolean;
  };
  request: { method: string; path: string };
};

/**
 * SEC-04/2B.2: authorization preflight ONLY; no DB reads, mutation or HTTP hook.
 * Caller must revalidate authenticated session, lock domain and append atomic
 * audit before any future endpoint is enabled. This function alone is NOT auth.
 */
export function preflightCentralGlobalCatalogWrite(input: GlobalCatalogWriteInput):
  { route: string; permission: Permission; scope: "module_global" } {
  const { principal, workstation, request } = input;
  const rule = classifyCentralRouteAction(request.method, request.path);
  if (!rule || rule.method === "GET" || rule.module !== "operational" ||
      rule.scope !== "module_global" || !rule.permission)
    throw new AccessError("central_action_not_supported");
  if (!workstation.active || workstation.pendingApproval)
    throw new AccessError("workstation_inactive");
  if (!principal.workstationId || principal.workstationId !== workstation.id)
    throw new AccessError("workstation_session_mismatch");
  assertModule(principal, workstation, "operational");
  assertPermission(principal, rule.permission);
  // A global catalog can affect assets, calls and analytics outside an
  // operator's visible machine set. Never elevate a scoped principal here.
  assertFullMachineScope(principal);
  return { route: rule.route, permission: rule.permission, scope: "module_global" };
}
