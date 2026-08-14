import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import { getServerNowIso } from "./serverClock";

export function diffMinutes(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return ms / 60000;
}

export function calculateCallWaitingMinutes(call: AndonCall, nowIso?: string): number {
  const end = call.attendedAt ?? nowIso ?? getServerNowIso();
  return diffMinutes(call.openedAt, end);
}

export function calculateAttendanceMinutes(call: AndonCall, nowIso?: string): number {
  const accumulatedMinutes = call.attendanceMinutes ?? 0;
  if (call.currentAttendanceStartedAt) {
    const end = call.finishedAt ?? nowIso ?? getServerNowIso();
    return accumulatedMinutes + diffMinutes(call.currentAttendanceStartedAt, end);
  }
  if (accumulatedMinutes > 0 || call.maintenanceCompletedAt || call.finishedAt) {
    return accumulatedMinutes;
  }
  if (!call.attendedAt) return 0;
  const end = nowIso ?? getServerNowIso();
  return diffMinutes(call.attendedAt, end);
}

export function calculatePostMaintenanceMinutes(call: AndonCall, nowIso?: string): number {
  const accumulatedMinutes = call.postMaintenanceMinutes ?? 0;
  if (call.maintenanceCompletedAt && call.status === "post_maintenance") {
    const end = call.finishedAt ?? nowIso ?? getServerNowIso();
    return accumulatedMinutes + diffMinutes(call.maintenanceCompletedAt, end);
  }
  return accumulatedMinutes;
}

export function calculateTotalCallMinutes(call: AndonCall, nowIso?: string): number {
  const end = call.finishedAt ?? nowIso ?? getServerNowIso();
  return diffMinutes(call.openedAt, end);
}

export function getActiveMachineStoppedAt(machine: Machine): string | null {
  if (machine.machineStatus !== "stopped") return null;

  const openStop = machine.stopHistory.find((event) => !event.resumedAt);
  return openStop?.stoppedAt ?? machine.stoppedAt ?? machine.lastStatusChangedAt ?? null;
}

export function calculateMachineStoppedMinutes(machine: Machine, nowIso?: string): number {
  const stoppedAt = getActiveMachineStoppedAt(machine);
  if (!stoppedAt) return 0;
  const end = nowIso ?? getServerNowIso();
  return diffMinutes(stoppedAt, end);
}

export function formatDurationMinutes(minutes: number): string {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const remainingSeconds = totalSeconds % 3600;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  if (days > 0) {
    return `${days} d ${hours.toString().padStart(2, "0")} h ${mins
      .toString()
      .padStart(2, "0")} min`;
  }
  if (hours > 0) {
    return `${hours} h ${mins.toString().padStart(2, "0")} min ${secs
      .toString()
      .padStart(2, "0")} s`;
  }
  if (mins > 0) return `${mins} min ${secs.toString().padStart(2, "0")} s`;
  return `${secs} s`;
}

export function formatCompactDurationMinutes(minutes: number, emptyLabel = "sem registro"): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return emptyLabel;

  const totalMinutes = Math.floor(minutes);

  if (totalMinutes < 1) return "menos de 1 min";

  const units = [
    { minutes: 365 * 24 * 60, singular: "ano", plural: "anos" },
    { minutes: 30 * 24 * 60, singular: "mês", plural: "meses" },
    { minutes: 24 * 60, singular: "d", plural: "d" },
    { minutes: 60, singular: "h", plural: "h" },
    { minutes: 1, singular: "min", plural: "min" },
  ];

  let remainingMinutes = totalMinutes;
  const parts: string[] = [];

  for (const unit of units) {
    const value = Math.floor(remainingMinutes / unit.minutes);

    if (value <= 0) continue;

    const label = value === 1 ? unit.singular : unit.plural;
    parts.push(`${value} ${label}`);
    remainingMinutes %= unit.minutes;

    if (parts.length === 2) break;
  }

  return parts.join(" ");
}
