/** Advisory-only UI mirror of the server's fail-closed session allowlist.
 * The server remains the sole authority for persistent session issuance.
 * When changing this catalog, review server/src/access/sessions.ts and its tests.
 */
export const PERSISTENT_OPERATIONAL_ALLOWED_KEYS = [
  "andon.read", "history.read", "calls.open", "calls.cancel.own",
  "calls.attend", "calls.technicians.manage", "calls.finishMaintenance",
  "calls.finish", "calls.followUp", "calls.returnToMaintenance",
  "bi.read", "bi.export", "priorities.read",
] as const;

const allowed = new Set<string>(PERSISTENT_OPERATIONAL_ALLOWED_KEYS);
export const persistentSessionIncompatibleGrants = (selected: readonly string[]) =>
  selected.filter((key) => !allowed.has(key));

/** Minimal starting point for production screens: explicit opt-in only. */
export function suggestedPersistentProductionGrants(catalog: readonly string[]) {
  const safe = ["andon.read", "history.read", "calls.open", "calls.cancel.own"];
  return safe.filter((key) => catalog.includes(key));
}
