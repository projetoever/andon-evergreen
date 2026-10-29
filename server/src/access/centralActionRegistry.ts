import { isPermission, type Permission } from "./policy.js";

/**
 * Planning registry for central access, NOT an authorization hook.
 *
 * Every matched route still requires workstation + principal validation, an
 * explicit machine-scoped database predicate, domain ownership checks where
 * applicable, and action audit before any central-mode mutation is enabled.
 */
export type ResourceScope =
  | "collection_filter"
  | "aggregate_filter"
  | "machine_from_body"
  | "machines_from_body"
  | "machine_from_route"
  | "machine_from_call_record"
  | "machine_from_set_record"
  | "machine_from_subset_record"
  | "module_global"
  | "needs_call_ownership";

export type CentralRouteAction = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  route: string;
  permission: Permission | null;
  scope: ResourceScope;
  module: "operational" | "bi" | "priorities";
  blockedReason?: string;
};

export const CENTRAL_ROUTE_ACTIONS: readonly CentralRouteAction[] = [
  { method: "GET", route: "/api/machines", permission: "andon.read", scope: "collection_filter", module: "operational" },
  { method: "GET", route: "/api/machines/:id", permission: "andon.read", scope: "machine_from_route", module: "operational" },
  { method: "PATCH", route: "/api/machines/:id/status", permission: "machines.status.write", scope: "machine_from_route", module: "operational" },
  { method: "PATCH", route: "/api/machines/:id/production-mode", permission: "production.schedule.write", scope: "machine_from_route", module: "operational" },

  // Planning-only asset mutation permissions. The central middleware still
  // rejects ALL writes. Ownership is resolved from the database by the
  // dedicated SEC-04/2B.1 preflight before any future domain callback.
  { method: "POST", route: "/api/machines/:machineId/sets", permission: "catalog.assets.manage", scope: "machine_from_route", module: "operational" },
  { method: "PATCH", route: "/api/machine-sets/:id", permission: "catalog.assets.manage", scope: "machine_from_set_record", module: "operational" },
  { method: "DELETE", route: "/api/machine-sets/:id", permission: "catalog.assets.manage", scope: "machine_from_set_record", module: "operational" },
  { method: "POST", route: "/api/machine-sets/:machineSetId/subsets", permission: "catalog.assets.manage", scope: "machine_from_set_record", module: "operational" },
  { method: "PATCH", route: "/api/machine-subsets/:id", permission: "catalog.assets.manage", scope: "machine_from_subset_record", module: "operational" },
  { method: "DELETE", route: "/api/machine-subsets/:id", permission: "catalog.assets.manage", scope: "machine_from_subset_record", module: "operational" },

  { method: "GET", route: "/api/andon-calls", permission: "andon.read", scope: "collection_filter", module: "operational" },
  { method: "GET", route: "/api/andon-calls/history", permission: "history.read", scope: "collection_filter", module: "operational" },
  { method: "POST", route: "/api/andon-calls", permission: "calls.open", scope: "machine_from_body", module: "operational" },
  { method: "POST", route: "/api/andon-calls/batch", permission: "calls.open", scope: "machine_from_body", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/attend", permission: "calls.attend", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/cancel", permission: null, scope: "needs_call_ownership", module: "operational", blockedReason: "calls.cancel.own versus calls.cancel.any requires domain ownership resolution" },
  { method: "POST", route: "/api/andon-calls/:id/technicians", permission: "calls.technicians.manage", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/technicians/:technicianName/end", permission: "calls.technicians.manage", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/technicians/end", permission: "calls.technicians.manage", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/finish-maintenance", permission: "calls.finishMaintenance", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/return-to-maintenance", permission: "calls.returnToMaintenance", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/finish", permission: "calls.finish", scope: "machine_from_call_record", module: "operational" },
  { method: "PATCH", route: "/api/andon-calls/:id/failure-details", permission: "diagnosis.edit", scope: "machine_from_call_record", module: "operational" },

  { method: "GET", route: "/api/dashboard-priority/order", permission: "priorities.read", scope: "collection_filter", module: "priorities" },
  { method: "PUT", route: "/api/dashboard-priority/order", permission: "priorities.write", scope: "machines_from_body", module: "priorities" },

  { method: "GET", route: "/api/analytics/filter-options", permission: "bi.read", scope: "collection_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/overview", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/maintenance", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/reliability", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/temporal", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/machine-360", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/failure-intelligence", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
  { method: "GET", route: "/api/analytics/drilldown", permission: "bi.read", scope: "aggregate_filter", module: "bi" },
] as const;

function matchesRoute(template: string, pathname: string): boolean {
  const lhs = template.split("/");
  const rhs = pathname.split("/");
  if (lhs.length !== rhs.length) return false;
  return lhs.every((part, index) =>
    part.startsWith(":") ? Boolean(rhs[index]) : part === rhs[index],
  );
}

/** Unknown routes fail classification; never fall back to module-wide permission. */
export function classifyCentralRouteAction(
  method: string,
  pathWithQuery: string,
): CentralRouteAction | null {
  const pathname = pathWithQuery.split("?", 1)[0];
  return CENTRAL_ROUTE_ACTIONS.find(
    (rule) => rule.method === method.toUpperCase() && matchesRoute(rule.route, pathname),
  ) ?? null;
}

export function validateCentralActionCatalog(): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();
  for (const rule of CENTRAL_ROUTE_ACTIONS) {
    const key = rule.method + " " + rule.route;
    if (seen.has(key)) failures.push("duplicate: " + key);
    seen.add(key);
    if (rule.permission && !isPermission(rule.permission)) failures.push("unknown permission: " + key);
    if (!rule.permission && !rule.blockedReason) failures.push("unresolved action without reason: " + key);
  }
  return failures;
}
