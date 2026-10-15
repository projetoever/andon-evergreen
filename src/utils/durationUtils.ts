import { ui } from "@/i18n/translate";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import { getServerNowIso } from "./serverClock";

export function diffMinutes(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return ms / 60000;
}

export type MachineOccurrenceKind = "call" | "failure";

export interface MachineOccurrence {
  kind: MachineOccurrenceKind;
  occurredAt: string;
  callId?: string;
  stopEventId?: string;
  endedAt?: string | null;
  durationMinutes?: number;
}

type MachineOccurrenceMachine = Pick<Machine, "id" | "stopHistory">;
type MachineOccurrenceCall = Pick<AndonCall, "id" | "machineId" | "openedAt" | "isSystemTest">;

function occurrenceTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function getLastMachineOccurrence(
  machine: MachineOccurrenceMachine,
  calls: readonly MachineOccurrenceCall[],
): MachineOccurrence | null {
  const systemTestCallIds = new Set(
    calls.filter((call) => call.isSystemTest).map((call) => call.id),
  );

  let latestCall: MachineOccurrenceCall | null = null;
  let latestCallTime = Number.NEGATIVE_INFINITY;
  for (const call of calls) {
    if (call.machineId !== machine.id || call.isSystemTest) continue;
    const timestamp = occurrenceTimestamp(call.openedAt);
    if (timestamp > latestCallTime) {
      latestCall = call;
      latestCallTime = timestamp;
    }
  }

  let latestStop: Machine["stopHistory"][number] | null = null;
  let latestStopTime = Number.NEGATIVE_INFINITY;
  for (const stop of machine.stopHistory) {
    if (stop.callId && systemTestCallIds.has(stop.callId)) continue;
    const timestamp = occurrenceTimestamp(stop.stoppedAt);
    if (timestamp > latestStopTime) {
      latestStop = stop;
      latestStopTime = timestamp;
    }
  }

  if (!latestCall && !latestStop) return null;

  if (latestCall && latestCallTime >= latestStopTime) {
    return {
      kind: "call",
      occurredAt: latestCall.openedAt,
      callId: latestCall.id,
    };
  }

  if (!latestStop) return null;
  return {
    kind: "failure",
    occurredAt: latestStop.stoppedAt,
    stopEventId: latestStop.id,
    callId: latestStop.callId ?? undefined,
    endedAt: latestStop.resumedAt,
    durationMinutes: latestStop.durationMinutes,
  };
}

export function formatElapsedSince(
  occurredAt: string | null | undefined,
  nowIso = getServerNowIso(),
  emptyLabel = ui("Sem registro"),
): string {
  if (!occurredAt) return emptyLabel;
  const start = new Date(occurredAt).getTime();
  const end = new Date(nowIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return emptyLabel;

  const elapsedMinutes = Math.max(0, (end - start) / 60000);
  if (elapsedMinutes < 1) return ui("há menos de 1 min");

  return ui("há {0}", { 0: formatCompactDurationMinutes(elapsedMinutes, ui("menos de 1 min")) });
}

export function calculateCallWaitingMinutes(call: AndonCall, nowIso?: string): number {
  const end = call.attendedAt ?? call.finishedAt ?? nowIso ?? getServerNowIso();
  return diffMinutes(call.openedAt, end);
}

type CallWaitingSnapshot = Pick<AndonCall, "openedAt" | "attendedAt" | "finishedAt"> & {
  callWaitingMinutes?: number;
};

export function calculateCallWaitingSnapshotMinutes(
  call: CallWaitingSnapshot,
  nowIso: string,
): number {
  const waitingMinutes = call.callWaitingMinutes;
  const hasPersistedWaitingDuration =
    call.finishedAt !== null &&
    typeof waitingMinutes === "number" &&
    Number.isFinite(waitingMinutes) &&
    waitingMinutes >= 0;

  if (hasPersistedWaitingDuration) return waitingMinutes;

  const end = call.attendedAt ?? call.finishedAt ?? nowIso;
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
    return `${days} ${ui("d")} ${hours.toString().padStart(2, "0")} ${ui("h")} ${mins
      .toString()
      .padStart(2, "0")} ${ui("min")}`;
  }
  if (hours > 0) {
    return `${hours} ${ui("h")} ${mins.toString().padStart(2, "0")} ${ui("min")} ${secs
      .toString()
      .padStart(2, "0")} ${ui("s")}`;
  }
  if (mins > 0) return `${mins} ${ui("min")} ${secs.toString().padStart(2, "0")} ${ui("s")}`;
  return `${secs} ${ui("s")}`;
}

export function formatMachinePanelDurationMinutes(minutes: number): string {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));

  if (totalSeconds < 3600) {
    return formatDurationMinutes(minutes);
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days} ${ui("d")} ${hours.toString().padStart(2, "0")} ${ui("h")}`;
  }

  return `${hours} ${ui("h")} ${mins.toString().padStart(2, "0")} ${ui("min")}`;
}

export function formatMachineStoppedDurationMinutes(minutes: number): string {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    return `${days} ${ui("d")} ${hours.toString().padStart(2, "0")} ${ui("h")} ${mins
      .toString()
      .padStart(2, "0")} ${ui("min")}`;
  }

  if (hours > 0) {
    return `${hours} ${ui("h")} ${mins.toString().padStart(2, "0")} ${ui("min")} ${secs
      .toString()
      .padStart(2, "0")} ${ui("s")}`;
  }

  return formatDurationMinutes(minutes);
}

export function formatCompactDurationMinutes(
  minutes: number,
  emptyLabel = ui("sem registro"),
): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return emptyLabel;

  const totalMinutes = Math.floor(minutes);

  if (totalMinutes < 1) return ui("menos de 1 min");

  const units = [
    { minutes: 365 * 24 * 60, singular: ui("ano"), plural: ui("anos") },
    { minutes: 30 * 24 * 60, singular: ui("mês"), plural: ui("meses") },
    { minutes: 24 * 60, singular: ui("d"), plural: ui("d") },
    { minutes: 60, singular: ui("h"), plural: ui("h") },
    { minutes: 1, singular: ui("min"), plural: ui("min") },
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
