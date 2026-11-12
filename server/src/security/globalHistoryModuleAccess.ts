import { centralAccessEnabled } from "../access/http.js";
import { assertPermission, type Principal } from "../access/policy.js";

/** History is an optional fourth Hub CARD, not an extra coarse-grained user
 * permission. It relies on the existing explicit history.read and andon.read.
 * Machine scope is applied in the SQL layer, never at this UI boundary.
 */
export function globalHistoryModuleAccess(
  principal: Principal | null,
  workstation: { active: boolean; pendingApproval: boolean },
) {
  const available = centralAccessEnabled() &&
    process.env.ANDON_CENTRAL_GLOBAL_HISTORY_HTTP_ENABLED === "1";
  if (!available || !workstation.active || workstation.pendingApproval ||
      !principal || principal.purpose !== "normal" || principal.accountType !== "person") {
    return { available, allowed: false };
  }
  try {
    assertPermission(principal, "andon.read");
    assertPermission(principal, "history.read");
    return { available, allowed: true };
  } catch {
    return { available, allowed: false };
  }
}
