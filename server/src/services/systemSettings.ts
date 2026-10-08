import { prisma } from "../db/prisma.js";

export const GLOBAL_SYSTEM_SETTINGS_ID = "global";
export const ATTENDANCE_MODES = ["name", "pin", "rfid"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

const PUBLIC_SYSTEM_SETTINGS_SELECT = {
  id: true,
  allowWholeSetCalls: true,
  virtualKeyboardEnabled: true,
  requireWorkOrderAtOpen: true,
  restrictMaintenanceCompletionToAttendanceWorkstation: true,
  dashboardSoundMuteTimerEnabled: true,
  dashboardSoundMuteDurationMinutes: true,
  dashboardSoundAutoMuteTimerEnabled: true,
  dashboardSoundActiveDurationMinutes: true,
  dashboardSoundMuted: true,
  dashboardSoundMutedAt: true,
  dashboardSoundMutedUntil: true,
  dashboardSoundMuteReason: true,
  dashboardMachineOrderMode: true,
  attendanceMode: true,
  rfidReaderMode: true,
  rfidInputTerminator: true,
  rfidCodeLength: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function getSystemSettings() {
  return prisma.systemSettings.upsert({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    update: {},
    create: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: PUBLIC_SYSTEM_SETTINGS_SELECT,
  });
}

export async function allowsWholeSetCalls() {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { allowWholeSetCalls: true },
  });

  return settings?.allowWholeSetCalls ?? true;
}

export async function requiresWorkOrderAtOpen(machineRequirement = false) {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    select: { requireWorkOrderAtOpen: true },
  });

  return (settings?.requireWorkOrderAtOpen ?? false) || machineRequirement;
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
