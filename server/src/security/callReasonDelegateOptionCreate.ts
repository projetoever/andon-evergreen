/** CFG-08B2: minimal payload for linking an EXISTING technical area to a
 * reason. A settings delegate cannot submit policy overrides or alter parent
 * KPI eligibility; the parent is re-read under the global catalog lock.
 *
 * Use in both HTTPS prehandler and audited transaction adapter.
 */
const OPTION_CREATE_FIELDS = new Set([
  "id", "technicalAreaId", "displayName", "active", "displayOrder",
]);
const ID = /^[a-z0-9_]{2,40}$/;

export type DelegatedOptionCreate = {
  id: string;
  technicalAreaId: string;
  displayName?: string | null;
  active?: boolean;
  displayOrder?: number;
};

export function isDelegatedOptionCreate(raw: unknown): raw is DelegatedOptionCreate {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  const fields = Object.keys(value);
  return fields.length >= 2 &&
    fields.every(field => OPTION_CREATE_FIELDS.has(field)) &&
    typeof value.id === "string" && ID.test(value.id) &&
    typeof value.technicalAreaId === "string" && ID.test(value.technicalAreaId) &&
    (value.active === undefined || typeof value.active === "boolean") &&
    (value.displayOrder === undefined ||
      (Number.isSafeInteger(value.displayOrder) &&
       (value.displayOrder as number) >= 0 && (value.displayOrder as number) <= 9999)) &&
    (value.displayName === undefined || value.displayName === null ||
      (typeof value.displayName === "string" &&
       value.displayName.trim().length >= 1 &&
       value.displayName.trim().length <= 80));
}

/** No implicit corrective KPI promotion, even if an old parent was marked
 * eligible by its policy owner. Rechecked using the CURRENT DB row in the
 * locked mutation, never using a client-supplied parent snapshot.
 */
export function assertDelegatedOptionLinkPolicy(reason: {
  maintenanceKpiPolicy: string;
  active: boolean;
}) {
  return reason.maintenanceKpiPolicy !== "eligible" && reason.active === true;
}
