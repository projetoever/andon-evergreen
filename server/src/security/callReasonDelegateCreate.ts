/** CFG-08B1: allow a Config. do ANDON delegate to register a reason
 * without ever choosing or promoting corrective KPI, responsibility or
 * analytics disposition. The central catalog flag remains OFF by default.
 *
 * Validate this exact whitelist in BOTH the HTTP gate and domain adapter.
 */
const SAFE_REASON_FIELDS = new Set([
  "id", "displayName", "color", "displayOrder", "active", "nature",
]);
const NATURES = new Set([
  "corrective_failure", "planned_setup", "production_support", "unclassified",
]);

export type DelegatedReasonCreate = {
  id: string;
  displayName: string;
  nature: "corrective_failure" | "planned_setup" | "production_support" | "unclassified";
  color?: string;
  displayOrder?: number;
  active?: boolean;
};

export function isDelegatedReasonCreate(raw: unknown): raw is DelegatedReasonCreate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const input = raw as Record<string, unknown>;
  const keys = Object.keys(input);
  return keys.length >= 3 &&
    keys.every(key => SAFE_REASON_FIELDS.has(key)) &&
    typeof input.id === "string" &&
    typeof input.displayName === "string" &&
    typeof input.nature === "string" &&
    NATURES.has(input.nature);
}

/** Only trusted server code may append these defaults. Never copy policy
 * values from the request, even when it names a corrective reason.
 */
export function conservativeReasonCreate(raw: DelegatedReasonCreate) {
  const operative = raw.nature === "planned_setup" || raw.nature === "production_support";
  return {
    ...raw,
    suggestedResponsibility: operative ? "operations" : "unassigned",
    maintenanceKpiPolicy: operative ? "excluded" : "pending",
    analyticsDisposition: "include",
  };
}
