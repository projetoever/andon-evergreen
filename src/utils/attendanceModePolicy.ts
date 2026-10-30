import type { AttendanceMode } from "@/types/systemSettings";

/**
 * The pre-central installation may persist "name" as its legacy attendance
 * setting. Central writes require a verified PIN/RFID credential, so name
 * selection must never be offered as an actionable central path.
 *
 * Do not mutate the global setting: turning central access OFF restores the
 * exact legacy behavior and its previously saved preference.
 */
export function effectiveAttendanceMode(configured: AttendanceMode, central: boolean): AttendanceMode {
  return central && configured === "name" ? "pin" : configured;
}

export function allowedAttendanceModes(
  configured: AttendanceMode | undefined, central: boolean,
): AttendanceMode[] {
  return !central && configured === "name"
    ? ["name", "pin", "rfid"]
    : ["pin", "rfid"];
}
