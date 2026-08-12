import { prisma } from "../db/prisma.js";

export const GLOBAL_SYSTEM_SETTINGS_ID = "global";
export const ATTENDANCE_MODES = ["name", "pin", "rfid"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    update: {},
    create: { id: GLOBAL_SYSTEM_SETTINGS_ID },
  });
}

export async function allowsWholeSetCalls() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { allowWholeSetCalls: true },
  });

  return settings?.allowWholeSetCalls ?? true;
}

export async function getAttendanceMode() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { attendanceMode: true },
  });

  return ATTENDANCE_MODES.includes(settings?.attendanceMode as AttendanceMode)
    ? (settings?.attendanceMode as AttendanceMode)
    : "name";
}
