import type { GlobalHistoryCallDetail, GlobalHistoryTechnicianSession } from "@/services/globalHistoryService";
import { calculateOperationalImpactBreakdown, type OperationalImpactBreakdown } from "@/utils/timeBreakdownUtils";
import type { MachineProductionEvent, MachineStopEvent } from "@/types/machine";

const minuteMs = 60_000;
const timestamp = (value: string | null | undefined) => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
};

/** Unfinished or corrupted sessions have no proven individual duration. */
export function historySessionMinutes(session: GlobalHistoryTechnicianSession): number | null {
  const start = timestamp(session.startedAt);
  const end = timestamp(session.endedAt);
  return start !== null && end !== null && end >= start ? (end - start) / minuteMs : null;
}

export type HistoryTechnicianTotal = {
  key: string;
  name: string;
  sessions: number;
  maintenanceMinutes: number;
  followUpMinutes: number;
  measuredSessions: number;
};

export function historyTechnicianTotals(sessions: GlobalHistoryTechnicianSession[]): HistoryTechnicianTotal[] {
  const result = new Map<string, HistoryTechnicianTotal>();
  for (const session of sessions) {
    const name = session.technicianName?.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("pt-BR");
    const row = result.get(key) ?? {
      key, name, sessions: 0, maintenanceMinutes: 0, followUpMinutes: 0, measuredSessions: 0,
    };
    row.sessions += 1;
    const minutes = historySessionMinutes(session);
    if (minutes !== null) {
      row.measuredSessions += 1;
      if (session.phase === "follow_up") row.followUpMinutes += minutes;
      else row.maintenanceMinutes += minutes;
    }
    result.set(key, row);
  }
  return [...result.values()];
}

/** The mode labels must represent the *whole* historical call interval.
 * Snapshots at open/finish alone do not establish this; reject gaps and
 * conflicting overlaps rather than assume that production was scheduled.
 */
export function historicalProductionCoverage(call: GlobalHistoryCallDetail, nowIso: string): boolean {
  const start = timestamp(call.openedAt), end = timestamp(call.finishedAt ?? nowIso);
  if (start === null || end === null || end <= start || call.productionHistoryTruncated) return false;
  const periods = (call.productionHistory ?? []).map(row => ({
    start: timestamp(row.startedAt),
    end: timestamp(row.endedAt ?? nowIso),
    mode: row.productionMode,
  })).filter((x): x is { start: number; end: number; mode: string } =>
    x.start !== null && x.end !== null && x.end > start && x.start < end);
  periods.sort((a, b) => a.start - b.start || a.end - b.end);
  if (!periods.length) return false;
  let cursor = start;
  let currentMode: string | null = null;
  for (const row of periods) {
    if (row.mode !== "scheduled" && row.mode !== "not_scheduled") return false;
    if (row.start > cursor) return false;
    // Different production states overlapping the same instant are ambiguous.
    if (currentMode && row.start < cursor && row.mode !== currentMode) return false;
    if (row.end > cursor) {
      cursor = row.end;
      currentMode = row.mode;
    }
  }
  return cursor >= end;
}

export function historicalCallImpact(call: GlobalHistoryCallDetail, nowIso: string): OperationalImpactBreakdown | null {
  if (call.impactTrackingVersion !== 1 ||
      !historicalProductionCoverage(call, nowIso)) return null;
  const start = timestamp(call.openedAt), end = timestamp(call.finishedAt ?? nowIso);
  if (start === null || end === null) return null;
  const stops: MachineStopEvent[] = [];
  for (const row of call.impactIntervals ?? []) {
    const begun = timestamp(row.startedAt), finished = timestamp(row.endedAt ?? nowIso);
    if (begun === null || finished === null || finished < begun) return null;
    stops.push({
      id: row.id, machineId: call.machineId, callId: call.id,
      stoppedAt: row.startedAt, resumedAt: row.endedAt,
      durationMinutes: row.durationSeconds !== null && row.durationSeconds !== undefined
        ? row.durationSeconds / 60 : Math.max(0, (finished - begun) / minuteMs),
      source: "system",
    });
  }
  if (stops.length === 0 && typeof call.machineStoppedMinutes === "number" &&
      call.machineStoppedMinutes > 0) return null;
  const productionHistory: MachineProductionEvent[] = (call.productionHistory ?? []).map(row => ({
    id: row.id, machineId: row.machineId,
    productionMode: row.productionMode === "not_scheduled" ? "not_scheduled" : "scheduled",
    startedAt: row.startedAt, endedAt: row.endedAt,
    durationMinutes: 0,
  }));
  return calculateOperationalImpactBreakdown({
    periodStart: call.openedAt,
    periodEnd: call.finishedAt ?? nowIso,
    now: new Date(nowIso),
    stopHistory: stops, productionHistory,
    fallbackMachineCondition: "running",
    // Only used when the history has full coverage, validated above.
    fallbackProductionMode: "scheduled",
  });
}
