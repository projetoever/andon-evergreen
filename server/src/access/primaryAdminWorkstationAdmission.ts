/**
 * An authenticated primary Admin may bootstrap ONLY a genuinely pending
 * workstation. An explicitly deactivated or rejected station remains denied.
 * This does not make the workstation trusted or give a human a persistent
 * session; every session still expires on the ordinary server schedule.
 */
export function mayAutoApprovePrimaryAdminStation(
  user: { active: boolean; isPrimaryAdmin: boolean; mustChangePassword: boolean; accountType: string; machineScope: string },
  workstation: {
    active: boolean;
    pendingApproval: boolean;
    admission: { status: string } | null;
  } | null,
): boolean {
  return user.active && user.isPrimaryAdmin && user.accountType === "person" &&
    user.machineScope === "all" && !user.mustChangePassword &&
    workstation !== null && !workstation.active && workstation.pendingApproval &&
    (workstation.admission === null || workstation.admission.status === "pending");
}
