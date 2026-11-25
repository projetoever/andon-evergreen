import type { ModuleAccess } from "@/types/modules";

/** The server materializes the Global History grant only when ALL required
 * permissions and feature/workstation gates pass. The UI also enforces the
 * user's machine scope before displaying the shortcut; the backend rechecks.
 */
export function canShowPriorityMachineHistory(access: ModuleAccess | null, machineId: string) {
  if (!access || access.centralAccessEnabled !== true ||
      access.globalHistory?.available !== true || access.globalHistory.allowed !== true ||
      !access.principal || access.principal.purpose !== "normal")
    return false;
  return access.principal.machineScope === "all" ||
    (access.principal.machineScope === "selected" &&
      access.principal.machineIds.includes(machineId));
}
