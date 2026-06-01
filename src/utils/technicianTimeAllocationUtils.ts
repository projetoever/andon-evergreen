import type {
  AndonCall,
  TechnicianAttendanceSession,
  TechnicianTimeAllocation,
} from "@/types/andon";
import { diffMinutes } from "@/utils/durationUtils";

interface BuildTechnicianTimeAllocationsParams {
  call: AndonCall;
  finalizedAt: string;
  technicianNames: string[];
  selectedTechnicianIdsByName?: Map<string, string | undefined>;
}

function normalizeTechnicianName(name?: string | null): string | null {
  const normalizedName = name?.trim();
  return normalizedName ? normalizedName : null;
}

function getSessionEnd(session: TechnicianAttendanceSession, finalizedAt: string): string {
  return session.endedAt ?? finalizedAt;
}

function getAttendanceStart(call: AndonCall): string {
  return call.attendedAt ?? call.currentAttendanceStartedAt ?? call.openedAt;
}

function mergeTechnicianNames(names: Array<string | null | undefined>): string[] {
  const mergedNames: string[] = [];
  const seenNames = new Set<string>();

  names.forEach((name) => {
    const normalizedName = normalizeTechnicianName(name);
    if (!normalizedName || seenNames.has(normalizedName)) return;
    seenNames.add(normalizedName);
    mergedNames.push(normalizedName);
  });

  return mergedNames;
}

function buildRegisteredSessionAllocations(
  sessions: TechnicianAttendanceSession[],
  finalizedAt: string,
  selectedTechnicianIdsByName: Map<string, string | undefined>,
): TechnicianTimeAllocation[] {
  const sessionsByTechnicianName = new Map<string, TechnicianAttendanceSession[]>();

  sessions.forEach((session) => {
    const technicianName = normalizeTechnicianName(session.technicianName);
    if (!technicianName) return;
    const technicianSessions = sessionsByTechnicianName.get(technicianName) ?? [];
    technicianSessions.push(session);
    sessionsByTechnicianName.set(technicianName, technicianSessions);
  });

  return Array.from(sessionsByTechnicianName.entries()).map(([technicianName, technicianSessions]) => {
    const sortedSessions = technicianSessions
      .slice()
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const firstSession = sortedSessions[0];
    const lastSession = sortedSessions.reduce((latestSession, session) => {
      const latestEndedAt = getSessionEnd(latestSession, finalizedAt);
      const sessionEndedAt = getSessionEnd(session, finalizedAt);
      return new Date(sessionEndedAt).getTime() >= new Date(latestEndedAt).getTime()
        ? session
        : latestSession;
    }, sortedSessions[0]);
    const minutes = sortedSessions.reduce(
      (totalMinutes, session) => totalMinutes + diffMinutes(session.startedAt, getSessionEnd(session, finalizedAt)),
      0,
    );

    return {
      technicianId: selectedTechnicianIdsByName.get(technicianName) ?? firstSession.technicianId,
      technicianName,
      startedAt: firstSession.startedAt,
      endedAt: getSessionEnd(lastSession, finalizedAt),
      minutes,
      source: "registered_session",
    };
  });
}

export function buildTechnicianTimeAllocations({
  call,
  finalizedAt,
  technicianNames,
  selectedTechnicianIdsByName = new Map(),
}: BuildTechnicianTimeAllocationsParams): TechnicianTimeAllocation[] {
  const sessions = call.technicianSessions ?? [];
  const sessionAllocations = buildRegisteredSessionAllocations(
    sessions,
    finalizedAt,
    selectedTechnicianIdsByName,
  );
  const techniciansWithRegisteredSessions = new Set(
    sessionAllocations.map((allocation) => allocation.technicianName),
  );

  const finalTechnicianNames = mergeTechnicianNames(technicianNames);
  const totalAttendanceStartedAt = getAttendanceStart(call);
  const totalAttendanceMinutes = diffMinutes(totalAttendanceStartedAt, finalizedAt);
  const fullPeriodAllocations: TechnicianTimeAllocation[] = finalTechnicianNames
    .filter((name) => !techniciansWithRegisteredSessions.has(name))
    .map((name) => ({
      technicianId: selectedTechnicianIdsByName.get(name),
      technicianName: name,
      startedAt: totalAttendanceStartedAt,
      endedAt: finalizedAt,
      minutes: totalAttendanceMinutes,
      source: "full_period_final_selection",
    }));

  return [...sessionAllocations, ...fullPeriodAllocations];
}
