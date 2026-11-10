import type { AttendanceMode } from "@/types/systemSettings";

/**
 * REFINE13: 'name' is an explicitly declared technician identity, not PIN/RFID
 * authentication. Central server must authorize the workstation and actor,
 * validate the technician, and atomically audit the declaration.
 * A central installation without the declared-attendance feature flag refuses
 * this mutation server-side.
 */
export function effectiveAttendanceMode(configured: AttendanceMode, _central: boolean): AttendanceMode {
  return configured;
}

export function allowedAttendanceModes(
  configured: AttendanceMode | undefined, _central: boolean,
): AttendanceMode[] {
  return configured === "name" ? ["name", "pin", "rfid"] : ["pin", "rfid"];
}
