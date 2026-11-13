export const PERMISSIONS = [
  "andon.read",
  // Visible access to the ANDON settings panel; field-specific writes remain guarded.
  "andon.settings.open",
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
  "production.schedule.request", // One-shot request only; never authorizes an unattended change.
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
  // One-time credential-verified release of this machine screen only.
  "workstations.screen.unlock",
  "workstations.manage",
  "hub.settings.presentation.write",
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
  persistentOperational?: boolean;
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
/**
 * R10-09: explicit, role-agnostic delegation for the ANDON configuration
 * surface only. This is NOT Hub administration or authorization for arbitrary
 * ANDON operational writes. The caller must still validate HTTPS/session,
 * workstation, CSRF, route-specific payload, locks and mutation audit.
 */
export function isAndonSettingsDelegate(principal: Principal): boolean {
  return principal.purpose === "normal" &&
    principal.accountType === "person" &&
    !principal.isPrimaryAdmin &&
    principal.permissions.includes("andon.settings.open");
}

const DELEGATABLE_ANDON_CATALOG_GRANTS: ReadonlySet<Permission> = new Set([
  "catalog.assets.manage",
  "catalog.reasons.manage",
  "catalog.classifications.manage",
  "catalog.technicians.manage",
]);

export function assertAndonSettingsOrPermission(
  principal: Principal, permission: Permission,
): void {
  // A future caller must not be able to misuse the config grant as a
  // shortcut to Hub, security, BI, workstation or operational privileges.
  if (DELEGATABLE_ANDON_CATALOG_GRANTS.has(permission) &&
      isAndonSettingsDelegate(principal)) return;
  assertPermission(principal, permission);
}

export function assertFullMachineScope(principal: Principal) {
  if (principal.machineScope !== "all") throw new AccessError("scoped_query_required");
}
export function assertModule(
  principal: Principal,
  _station: {
    allowOperational: boolean;
    allowBi: boolean;
    allowPriorities: boolean;
  },
  module: "operational" | "bi" | "priorities",
) {
  // Central mode: workstation approval/active is checked separately in session
  // and request guards. Module authorizations belong to the authenticated user.
  // This intentionally ignores legacy per-terminal allow* flags; they are
  // still honored by the separate legacy (central-OFF) module gate.
  const permission =
    module === "operational" ? "andon.read" : module === "bi" ? "bi.read" : "priorities.read";
  assertPermission(principal, permission);
}
