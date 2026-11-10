import type { AttendanceMode } from "@/types/systemSettings";

/**
 * The server advertises this capability only when declared central attendance
 * has been explicitly enabled. Otherwise central uses credential verification,
 * while legacy (central OFF) keeps its previously configured preference.
 */
export function effectiveAttendanceMode(
  configured: AttendanceMode,
  central: boolean,
  declaredEnabled = false,
): AttendanceMode {
  return central && configured === "name" && !declaredEnabled ? "pin" : configured;
}

export function allowedAttendanceModes(
  configured: AttendanceMode | undefined,
  central: boolean,
  declaredEnabled = false,
): AttendanceMode[] {
  return configured === "name" && (!central || declaredEnabled)
    ? ["name", "pin", "rfid"]
    : ["pin", "rfid"];
}
