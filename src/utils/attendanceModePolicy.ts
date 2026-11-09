import type { AttendanceMode } from "@/types/systemSettings";

/**
 * Legacy may persist "name". In central mode this is a separate OPERATOR
 * DECLARATION, never verified PIN/RFID identity. Names are available only
 * when the central server responds with an explicit, OFF-by-default runtime
 * capability. This policy is presentation only: the backend route has its
 * own session, workstation, scope, CSRF, flag and transaction guards.
 * Preserve the exact stored legacy preference when central access is OFF.
 */
export function effectiveAttendanceMode(
  configured: AttendanceMode, central: boolean, declaredNameEnabled = false,
): AttendanceMode {
  return central && configured === "name" && !declaredNameEnabled ? "pin" : configured;
}

export function allowedAttendanceModes(
  configured: AttendanceMode | undefined, central: boolean, declaredNameEnabled = false,
): AttendanceMode[] {
  return (central && declaredNameEnabled) || (!central && configured === "name")
    ? ["name", "pin", "rfid"]
    : ["pin", "rfid"];
}
