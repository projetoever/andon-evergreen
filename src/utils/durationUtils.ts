import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";

export function diffMinutes(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / 60000);
}

export function calculateCallWaitingMinutes(call: AndonCall, nowIso?: string): number {
  const end = call.attendedAt ?? nowIso ?? new Date().toISOString();
  return diffMinutes(call.openedAt, end);
}

export function calculateAttendanceMinutes(call: AndonCall, nowIso?: string): number {
  const accumulatedMinutes = call.attendanceMinutes ?? 0;
  if (call.currentAttendanceStartedAt) {
    const end = call.finishedAt ?? nowIso ?? new Date().toISOString();
    return accumulatedMinutes + diffMinutes(call.currentAttendanceStartedAt, end);
  }
  if (accumulatedMinutes > 0 || call.maintenanceCompletedAt || call.finishedAt) {
    return accumulatedMinutes;
  }
  if (!call.attendedAt) return 0;
  const end = nowIso ?? new Date().toISOString();
  return diffMinutes(call.attendedAt, end);
}

export function calculatePostMaintenanceMinutes(call: AndonCall, nowIso?: string): number {
  const accumulatedMinutes = call.postMaintenanceMinutes ?? 0;
  if (call.maintenanceCompletedAt && call.status === "post_maintenance") {
    const end = call.finishedAt ?? nowIso ?? new Date().toISOString();
    return accumulatedMinutes + diffMinutes(call.maintenanceCompletedAt, end);
  }
  return accumulatedMinutes;
}

export function calculateTotalCallMinutes(call: AndonCall, nowIso?: string): number {
  const end = call.finishedAt ?? nowIso ?? new Date().toISOString();
  return diffMinutes(call.openedAt, end);
}

export function calculateMachineStoppedMinutes(machine: Machine, nowIso?: string): number {
  if (machine.machineStatus !== "stopped" || !machine.stoppedAt) return 0;
  const end = nowIso ?? new Date().toISOString();
  return diffMinutes(machine.stoppedAt, end);
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}min`;
}
