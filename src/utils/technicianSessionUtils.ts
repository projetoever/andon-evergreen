import type {
  AndonStatus,
  TechnicianAttendanceSession,
  TechnicianSessionPhase,
} from "@/types/andon";
import { diffMinutes } from "@/utils/durationUtils";

export interface TechnicianParticipationSummary {
  key: string;
  technicianId?: string;
  technicianName: string;
  technicalArea?: string;
  maintenanceMinutes: number;
  followUpMinutes: number;
  activePhase: TechnicianSessionPhase | null;
  activeSession: TechnicianAttendanceSession | null;
  participatedInMaintenance: boolean;
  participatedInFollowUp: boolean;
  maintenanceIntervals: TechnicianParticipationInterval[];
  followUpIntervals: TechnicianParticipationInterval[];
}

export interface TechnicianParticipationInterval {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  cycleIndex: number | null;
}

export function resolveSessionPhase(
  session: TechnicianAttendanceSession,
  callStatus?: AndonStatus,
): TechnicianSessionPhase {
  if (session.phase) return session.phase;
  return callStatus === "post_maintenance" && !session.endedAt ? "follow_up" : "maintenance";
}

export function buildTechnicianParticipationSummaries(
  sessions: TechnicianAttendanceSession[],
  nowIso: string,
  callStatus?: AndonStatus,
): TechnicianParticipationSummary[] {
  const summaries = new Map<string, TechnicianParticipationSummary>();

  sessions
    .slice()
    .sort((current, next) => current.startedAt.localeCompare(next.startedAt))
    .forEach((session) => {
      const key = session.technicianId ?? session.technicianName.toLocaleLowerCase("pt-BR");
      const phase = resolveSessionPhase(session, callStatus);
      const minutes = diffMinutes(session.startedAt, session.endedAt ?? nowIso);
      const current = summaries.get(key) ?? {
        key,
        technicianId: session.technicianId,
        technicianName: session.technicianName,
        technicalArea: session.technicalArea,
        maintenanceMinutes: 0,
        followUpMinutes: 0,
        activePhase: null,
        activeSession: null,
        participatedInMaintenance: false,
        participatedInFollowUp: false,
        maintenanceIntervals: [],
        followUpIntervals: [],
      };

      const interval: TechnicianParticipationInterval = {
        sessionId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt ?? null,
        minutes,
        cycleIndex: session.cycleIndex ?? null,
      };

      if (phase === "maintenance") {
        current.maintenanceMinutes += minutes;
        current.participatedInMaintenance = true;
        current.maintenanceIntervals.push(interval);
      } else {
        current.followUpMinutes += minutes;
        current.participatedInFollowUp = true;
        current.followUpIntervals.push(interval);
      }
      current.technicalArea = session.technicalArea ?? current.technicalArea;
      if (!session.endedAt) {
        current.activePhase = phase;
        current.activeSession = session;
      }
      summaries.set(key, current);
    });

  return Array.from(summaries.values());
}
