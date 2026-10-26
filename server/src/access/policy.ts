export const PERMISSIONS = [
  "andon.read",
  "history.read",
  "calls.open",
  "calls.cancel.own",
  "calls.cancel.any",
  "calls.attend",
  "calls.technicians.manage",
  "calls.finishMaintenance",
  "calls.finish",
  "calls.followUp",
  "calls.returnToMaintenance",
  "machines.status.write",
  "production.schedule.write",
  "diagnosis.edit",
  "analytics.reclassify",
  "analytics.policy.manage",
  "bi.read",
  "bi.export",
  "priorities.read",
  "priorities.write",
  "catalog.assets.manage",
  "catalog.reasons.manage",
  "catalog.classifications.manage",
  "catalog.technicians.manage",
  "workstations.read",
  "workstations.manage",
  "users.create",
  "audit.read",
  "audit.export",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
export class AccessError extends Error {
  constructor(
    public code: string,
    public statusCode: number = 403,
  ) {
    super(code);
  }
}
export type Principal = {
  userId: string;
  login: string;
  displayName: string;
  roleLabel: string;
  accountType: string;
  isPrimaryAdmin: boolean;
  machineScope: string;
  machineIds: string[];
  permissions: string[];
  sessionId: string;
  workstationId: string;
  purpose: string;
  authenticatedAt: Date;
};
export function assertPermission(principal: Principal, permission: string, machineId?: string) {
  if (principal.purpose !== "normal") throw new AccessError("password_change_required");
  if (!isPermission(permission)) throw new AccessError("unknown_permission");
  if (!principal.isPrimaryAdmin && !principal.permissions.includes(permission)) {
    throw new AccessError("permission_denied");
  }
  if (machineId && principal.machineScope !== "all" && !principal.machineIds.includes(machineId)) {
    throw new AccessError("machine_scope_denied");
  }
  // Collection endpoints must apply this scope to their query, including totals.
  // Until they implement scoped aggregation, they must require this guard.
}
export function assertFullMachineScope(principal: Principal) {
  if (principal.machineScope !== "all") throw new AccessError("scoped_query_required");
}
export function assertModule(
  principal: Principal,
  station: {
    allowOperational: boolean;
    allowBi: boolean;
    allowPriorities: boolean;
  },
  module: "operational" | "bi" | "priorities",
) {
  const permission =
    module === "operational" ? "andon.read" : module === "bi" ? "bi.read" : "priorities.read";
  const allowed =
    module === "operational"
      ? station.allowOperational
      : module === "bi"
        ? station.allowBi
        : station.allowPriorities;
  if (!allowed) throw new AccessError("workstation_module_denied");
  assertPermission(principal, permission);
}
