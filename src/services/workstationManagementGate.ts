import type { DataMode } from "@/config/dataMode";

/** A network error (access=null) must never be treated as legacy permission.
 * This helper affects only the UI; API authorization remains authoritative.
 */
export function canManageWorkstationSettings(
  mode: DataMode,
  checking: boolean,
  access: { centralAccessEnabled: boolean } | null,
  principal: { isPrimaryAdmin?: boolean; permissions?: readonly string[] } | null | undefined,
): boolean {
  if (mode === "local") return true;
  if (checking || access === null) return false;
  if (access.centralAccessEnabled === false) return true; // confirmed legacy
  return principal?.isPrimaryAdmin === true ||
    principal?.permissions?.includes("workstations.manage") === true;
}
