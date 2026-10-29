/**
 * SEC-04 / stage 1: audit-only list of known writes NOT present in the planning
 * action registry. It is NOT a permission table and never authorizes a request.
 * In central mode all mutations remain denied until route-specific enforcement.
 */
export type UnmigratedWriteRoute = {
  source: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  route: string;
  reason: string;
};

export const UNMIGRATED_WRITE_ROUTES: readonly UnmigratedWriteRoute[] = [
  { source: "machines.ts", method: "POST", route: "/api/machines", reason: "Machine inventory changes require catalog policy, machine scope, referential checks and audit." },
  { source: "machines.ts", method: "PATCH", route: "/api/machines/:id", reason: "Machine inventory changes require catalog policy, machine scope, referential checks and audit." },
  { source: "machines.ts", method: "PATCH", route: "/api/machines/:id/active", reason: "Machine inventory changes require catalog policy, machine scope, referential checks and audit." },
  { source: "dashboardPriority.ts", method: "PATCH", route: "/api/dashboard-priority/access-policy", reason: "Priority access/credential/login routes retain their separate legacy guards; central migration and audit are not designed." },
  { source: "dashboardPriority.ts", method: "PUT", route: "/api/dashboard-priority/credentials", reason: "Priority access/credential/login routes retain their separate legacy guards; central migration and audit are not designed." },
  { source: "dashboardPriority.ts", method: "POST", route: "/api/dashboard-priority/login", reason: "Priority login uses separate module authentication; cannot inherit priorities.write." },
  { source: "dashboardPriority.ts", method: "POST", route: "/api/dashboard-priority/logout", reason: "Priority logout uses separate module authentication; cannot inherit priorities.write." },
  { source: "failureEvents.ts", method: "POST", route: "/api/failure-events", reason: "Physical downtime events can affect KPI attribution; require source-machine scope, ownership and audit." },
  { source: "failureEvents.ts", method: "PATCH", route: "/api/failure-events/:id", reason: "Physical downtime events can affect KPI attribution; require source-machine scope, ownership and audit." },
  { source: "failureEvents.ts", method: "PATCH", route: "/api/failure-events/:id/finish", reason: "Physical downtime events can affect KPI attribution; require source-machine scope, ownership and audit." },
  { source: "technicians.ts", method: "POST", route: "/api/technicians/identify", reason: "Technician identification is an authentication transition, not a generic technician-edit grant." },
  { source: "technicians.ts", method: "POST", route: "/api/technicians", reason: "Technician identity and technician catalog changes require separate identity or catalog authority and audit." },
  { source: "technicians.ts", method: "PATCH", route: "/api/technicians/:id", reason: "Technician identity and technician catalog changes require separate identity or catalog authority and audit." },
  { source: "shifts.ts", method: "PATCH", route: "/api/shifts/:id", reason: "Shift scheduling updates require production scheduling authority and audit." },
  { source: "systemSettings.ts", method: "PATCH", route: "/api/dashboard-sound-state", reason: "Shared sound state requires explicit device/operator scope; not equivalent to system-admin authority." },
  { source: "systemSettings.ts", method: "PATCH", route: "/api/system-settings", reason: "Platform-wide and dashboard sound changes need distinct authority and audit." },
  { source: "workstations.ts", method: "POST", route: "/api/workstations/register", reason: "Workstation registration is device admission/check-in, not a general access-management permission." },
  { source: "workstations.ts", method: "PATCH", route: "/api/workstations/:id/screen-lock", reason: "Station registration/preferences and admin updates require separate device and administration rules." },
  { source: "workstations.ts", method: "PUT", route: "/api/workstations/:id/machine-sound/:machineId", reason: "Station registration/preferences and admin updates require separate device and administration rules." },
  { source: "workstations.ts", method: "PATCH", route: "/api/workstations/:id", reason: "Station registration/preferences and admin updates require separate device and administration rules." },
  { source: "modules.ts", method: "PATCH", route: "/api/modules/settings", reason: "Module policy settings need independent administrator recovery and audit." },
  { source: "moduleCredentials.ts", method: "PUT", route: "/api/modules/:module/credentials", reason: "Module credentials and sessions require separate migration and credential safeguards." },
  { source: "moduleCredentials.ts", method: "POST", route: "/api/modules/:module/login", reason: "Module login is authentication, not operational permission." },
  { source: "moduleCredentials.ts", method: "POST", route: "/api/modules/:module/logout", reason: "Module logout is session termination, not operational permission." },
];
