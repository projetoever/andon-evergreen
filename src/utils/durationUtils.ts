import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";

export function diffMinutes(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return ms / 60000;
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
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const remainingSeconds = totalSeconds % 3600;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  if (hours > 0) {
    return `${hours} h ${mins.toString().padStart(2, "0")} min ${secs
      .toString()
      .padStart(2, "0")} s`;
  }
  if (mins > 0) return `${mins} min ${secs.toString().padStart(2, "0")} s`;
  return `${secs} s`;
}
