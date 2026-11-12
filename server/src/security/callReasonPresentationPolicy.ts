/** CFG-08A — a strictly non-policy subset that can be delegated by the
 * existing "Config. do ANDON" grant. Never allow a policy/nature override,
 * specialty reassignment, create/delete or arbitrary catalog mutation.
 *
 * This MUST be checked by both HTTP prehandler and transaction adapter.
 */
export type ReasonCatalogOperation =
  | "reason.create" | "reason.update" | "option.create" | "option.update";

const REASON_PRESENTATION = new Set([
  "expectedRevision", "displayName", "color", "active", "displayOrder",
]);
const OPTION_PRESENTATION = new Set([
  "expectedRevision", "displayName", "active", "displayOrder",
]);

export function isReasonPresentationOnlyPatch(
  operation: ReasonCatalogOperation,
  raw: unknown,
): boolean {
  if (operation !== "reason.update" && operation !== "option.update")
    return false;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return false;
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length < 2 || !Object.hasOwn(body, "expectedRevision") ||
      !Number.isSafeInteger(body.expectedRevision) ||
      (body.expectedRevision as number) < 1)
    return false;
  const allowed = operation === "reason.update"
    ? REASON_PRESENTATION : OPTION_PRESENTATION;
  return keys.every(key => allowed.has(key));
}
