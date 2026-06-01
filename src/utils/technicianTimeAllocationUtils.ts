import type {
  TechnicianAttendanceSession,
  TechnicianTimeAllocation,
} from "@/types/andon";
import { diffMinutes } from "@/utils/durationUtils";

interface AllocationTechnicianInput {
  id?: string;
  name: string;
}

interface BuildTechnicianTimeAllocationsParams {
  attendanceStartedAt: string | null;
  attendanceEndedAt: string;
  sessions: TechnicianAttendanceSession[];
  fallbackTechnicianNames: string[];
  selectedTechnicians?: AllocationTechnicianInput[];
}

function uniqueNames(names: string[]): string[] {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

export function buildTechnicianTimeAllocations({
  attendanceStartedAt,
  attendanceEndedAt,
  sessions,
  fallbackTechnicianNames,
  selectedTechnicians = [],
}: BuildTechnicianTimeAllocationsParams): TechnicianTimeAllocation[] {
  const selectedTechnicianByName = new Map(
    selectedTechnicians.map((technician) => [technician.name, technician]),
  );
  const normalizedSessions = sessions
    .filter((session) => session.technicianName.trim())
    .slice()
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  if (normalizedSessions.length > 0) {
    const allocations: TechnicianTimeAllocation[] = [];
    let previousSessionEndedAt = attendanceStartedAt;

    normalizedSessions.forEach((session) => {
      if (previousSessionEndedAt && diffMinutes(previousSessionEndedAt, session.startedAt) > 0) {
        allocations.push({
          technicianName: "Sem manutentor apontado",
          startedAt: previousSessionEndedAt,
          endedAt: session.startedAt,
          minutes: diffMinutes(previousSessionEndedAt, session.startedAt),
          source: "unassigned_time",
        });
      }

      const endedAt = session.endedAt ?? attendanceEndedAt;
      allocations.push({
        technicianId: session.technicianId,
        technicianName: session.technicianName,
        startedAt: session.startedAt,
        endedAt,
        minutes: diffMinutes(session.startedAt, endedAt),
        source: "registered_session",
      });
      previousSessionEndedAt = endedAt;
    });

    if (previousSessionEndedAt && diffMinutes(previousSessionEndedAt, attendanceEndedAt) > 0) {
      allocations.push({
        technicianName: "Sem manutentor apontado",
        startedAt: previousSessionEndedAt,
        endedAt: attendanceEndedAt,
        minutes: diffMinutes(previousSessionEndedAt, attendanceEndedAt),
        source: "unassigned_time",
      });
    }

    return allocations;
  }

  const technicianNames = uniqueNames(fallbackTechnicianNames);
  if (technicianNames.length === 0) {
    return attendanceStartedAt
      ? [
          {
            technicianName: "Sem manutentor apontado",
            startedAt: attendanceStartedAt,
            endedAt: attendanceEndedAt,
            minutes: diffMinutes(attendanceStartedAt, attendanceEndedAt),
            source: "unassigned_time",
          },
        ]
      : [];
  }

  return technicianNames.map((name) => {
    const selectedTechnician = selectedTechnicianByName.get(name);
    return {
      technicianId: selectedTechnician?.id,
      technicianName: name,
      startedAt: attendanceStartedAt,
      endedAt: attendanceEndedAt,
      minutes: diffMinutes(attendanceStartedAt, attendanceEndedAt),
      source:
        technicianNames.length === 1
          ? "single_responsible_full_period"
          : "full_period_final_selection",
    };
  });
}
