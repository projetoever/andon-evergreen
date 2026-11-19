import { centralAccessEnabled } from "../access/http.js";
import { assertPermission, type Principal } from "../access/policy.js";

/** Fifth Hub module is an explicit primary-Admin-issued grant for Global History.
 * Distinct from per-machine history.read; central feature opt-in, person session,
 * approved workstation and server SQL scope remain independent requirements.
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
    assertPermission(principal, "history.global.read");
    return { available, allowed: true };
  } catch {
    return { available, allowed: false };
  }
}
