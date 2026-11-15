import type { ModuleAccess } from "@/types/modules";

/** A pinned production screen may show history but must never navigate to
 * another machine, unpin the workstation or grant extra API scope.
 * Server-side history.read and SQL machine constraints remain mandatory. */
export function canOpenPinnedMachineHistory(
  access: ModuleAccess | null,
  pathname: string,
): boolean {
  const machineId = access?.workstation.lockedMachineId;
  if (!machineId) return false;
  const readAllowed = access.centralAccessEnabled === false ||
    (access.centralAccessEnabled === true &&
      access.principal?.canReadMachineHistory === true);
  if (!readAllowed) return false;
  const pinnedPath = `/machines/${encodeURIComponent(machineId)}`;
  if (pathname === `${pinnedPath}/call-history` ||
      pathname === `${pinnedPath}/failure-history`) return true;
  // The GLOBAL history page requires its independent opt-in, plus
  // the server-confirmed history grants and SQL scope. Never infer from route.
  return pathname === "/history" &&
    access.centralAccessEnabled === true &&
    access.globalHistory?.available === true &&
    access.globalHistory.allowed === true;
}
