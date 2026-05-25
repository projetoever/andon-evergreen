import type { AndonCall, TechnicianAttendanceSession } from "@/types/andon";

export type TechnicianTimeAllocationSource =
  | "registered_session"
  | "full_period_final_selection"
  | "single_responsible_full_period"
  | "unassigned_time";

export interface TechnicianTimeAllocation {
  technicianName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  source: TechnicianTimeAllocationSource;
  sessionIds?: string[];
  sourceLabel: string;
}

export interface TechnicianTimeAllocationSummary {
  allocations: TechnicianTimeAllocation[];
  unassignedSeconds: number;
}

function diffSeconds(start: string, end: string): number {
  const value = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getAttendanceBounds(call: AndonCall): { start: string | null; end: string | null } {
  const start = call.attendedAt ?? call.currentAttendanceStartedAt ?? call.openedAt ?? null;
  const end = call.finishedAt ?? call.maintenanceCompletedAt ?? call.updatedAt ?? null;
  return { start, end };
}

function sourceLabel(source: TechnicianTimeAllocationSource): string {
  const map: Record<TechnicianTimeAllocationSource, string> = {
    registered_session: "Sessão registrada",
    full_period_final_selection: "Período completo selecionado na finalização",
    single_responsible_full_period: "Responsável único pelo atendimento",
    unassigned_time: "Tempo sem manutentor apontado",
  };
  return map[source];
}

export function calculateTechnicianTimeAllocations(call: AndonCall): TechnicianTimeAllocationSummary {
  const { start, end } = getAttendanceBounds(call);
  if (!start || !end) return { allocations: [], unassignedSeconds: 0 };

  const attendanceSeconds = diffSeconds(start, end);
  const sessions = (call.technicianSessions ?? []).filter((session) => !!session.technicianName);
  const grouped = new Map<string, { seconds: number; startedAt: string; endedAt: string; sessionIds: string[] }>();

  for (const session of sessions) {
    const sessionEnd = session.endedAt ?? end;
    const seconds = diffSeconds(session.startedAt, sessionEnd);
    const current = grouped.get(session.technicianName);
    if (!current) {
      grouped.set(session.technicianName, {
        seconds,
        startedAt: session.startedAt,
        endedAt: sessionEnd,
        sessionIds: [session.id],
      });
      continue;
    }
    grouped.set(session.technicianName, {
      seconds: current.seconds + seconds,
      startedAt: new Date(session.startedAt) < new Date(current.startedAt) ? session.startedAt : current.startedAt,
      endedAt: new Date(sessionEnd) > new Date(current.endedAt) ? sessionEnd : current.endedAt,
      sessionIds: [...current.sessionIds, session.id],
    });
  }

  const finalNames = Array.from(new Set(call.technicianNames.length ? call.technicianNames : call.technicianName ? [call.technicianName] : []));
  const namesWithSession = new Set(grouped.keys());
  const extrasWithoutSession = finalNames.filter((name) => !namesWithSession.has(name));

  const allocations: TechnicianTimeAllocation[] = [];

  // Regra C: único técnico envolvido no total recebe período completo.
  if (finalNames.length === 1 && grouped.has(finalNames[0])) {
    allocations.push({
      technicianName: finalNames[0],
      startedAt: start,
      endedAt: end,
      durationSeconds: attendanceSeconds,
      source: "single_responsible_full_period",
      sessionIds: grouped.get(finalNames[0])?.sessionIds,
      sourceLabel: sourceLabel("single_responsible_full_period"),
    });
    return { allocations, unassignedSeconds: 0 };
  }

  // Regra A/F
  for (const [technicianName, value] of grouped.entries()) {
    allocations.push({
      technicianName,
      startedAt: value.startedAt,
      endedAt: value.endedAt,
      durationSeconds: value.seconds,
      source: "registered_session",
      sessionIds: value.sessionIds,
      sourceLabel: sourceLabel("registered_session"),
    });
  }

  // Regra B/D
  for (const technicianName of extrasWithoutSession) {
    allocations.push({
      technicianName,
      startedAt: start,
      endedAt: end,
      durationSeconds: attendanceSeconds,
      source: "full_period_final_selection",
      sourceLabel: sourceLabel("full_period_final_selection"),
    });
  }

  const sessionSeconds = allocations
    .filter((item) => item.source === "registered_session")
    .reduce((sum, item) => sum + item.durationSeconds, 0);

  const shouldShowUnassigned = extrasWithoutSession.length === 0 && grouped.size > 1 && attendanceSeconds > sessionSeconds;
  return {
    allocations,
    unassignedSeconds: shouldShowUnassigned ? attendanceSeconds - sessionSeconds : 0,
  };
}
