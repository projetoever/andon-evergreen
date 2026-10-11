export type AnalyticsMaintenanceSessionRecord = {
  id: string;
  callId: string;
  machineId: string;
  technicianId: string | null;
  technicianName: string;
  technicalArea: string | null;
  phase: string | null;
  cycleIndex: number | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type BuildMaintenanceParticipationParams = {
  sessions: AnalyticsMaintenanceSessionRecord[];
  start: Date;
  effectiveEnd: Date;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clipSessionMinutes(
  session: AnalyticsMaintenanceSessionRecord,
  start: Date,
  end: Date,
) {
  const clippedStart = Math.max(start.getTime(), session.startedAt.getTime());
  const clippedEnd = Math.min(
    end.getTime(),
    session.endedAt?.getTime() ?? end.getTime(),
  );

  return clippedEnd > clippedStart
    ? round2((clippedEnd - clippedStart) / 60_000)
    : 0;
}

function technicianKey(session: AnalyticsMaintenanceSessionRecord) {
  if (session.technicianId) return `id:${session.technicianId}`;
  return `legacy:${session.technicianName.trim().toLocaleLowerCase("pt-BR")}`;
}

export function buildMaintenanceParticipation({
  sessions,
  start,
  effectiveEnd,
}: BuildMaintenanceParticipationParams) {
  const technicianGroups = new Map<
    string,
    {
      technicianId: string | null;
      technicianName: string;
      maintenanceMinutes: number;
      followUpMinutes: number;
      callIds: Set<string>;
      technicalAreas: Set<string>;
      sessionCount: number;
      returnCycleSessions: number;
      activePhase: "maintenance" | "follow_up" | null;
      activeStartedAt: number;
    }
  >();

  const areaGroups = new Map<
    string,
    {
      technicalArea: string | null;
      maintenanceMinutes: number;
      followUpMinutes: number;
      technicianKeys: Set<string>;
      sessionCount: number;
    }
  >();

  let phaseAwareSessions = 0;
  let legacySessions = 0;
  let phaseAwareMinutes = 0;
  let legacyMinutes = 0;
  let activeSessionCount = 0;
  const callIds = new Set<string>();

  for (const session of sessions) {
    const minutes = clipSessionMinutes(session, start, effectiveEnd);
    if (minutes <= 0) continue;

    callIds.add(session.callId);

    const isMaintenance = session.phase === "maintenance";
    const isFollowUp = session.phase === "follow_up";

    if (!isMaintenance && !isFollowUp) {
      legacySessions += 1;
      legacyMinutes += minutes;
      continue;
    }

    phaseAwareSessions += 1;
    phaseAwareMinutes += minutes;

    const key = technicianKey(session);
    const technician = technicianGroups.get(key) ?? {
      technicianId: session.technicianId,
      technicianName: session.technicianName,
      maintenanceMinutes: 0,
      followUpMinutes: 0,
      callIds: new Set<string>(),
      technicalAreas: new Set<string>(),
      sessionCount: 0,
      returnCycleSessions: 0,
      activePhase: null,
      activeStartedAt: -Infinity,
    };

    if (isMaintenance) technician.maintenanceMinutes += minutes;
    if (isFollowUp) technician.followUpMinutes += minutes;
    technician.callIds.add(session.callId);
    if (session.technicalArea) technician.technicalAreas.add(session.technicalArea);
    technician.sessionCount += 1;

    if (isMaintenance && (session.cycleIndex ?? 1) > 1) {
      technician.returnCycleSessions += 1;
    }

    if (!session.endedAt) {
      activeSessionCount += 1;
      const startedAtMs = session.startedAt.getTime();

      if (startedAtMs >= technician.activeStartedAt) {
        technician.activeStartedAt = startedAtMs;
        technician.activePhase = isMaintenance ? "maintenance" : "follow_up";
      }
    }

    technicianGroups.set(key, technician);

    const areaKey = session.technicalArea ?? "__unclassified__";
    const area = areaGroups.get(areaKey) ?? {
      technicalArea: session.technicalArea,
      maintenanceMinutes: 0,
      followUpMinutes: 0,
      technicianKeys: new Set<string>(),
      sessionCount: 0,
    };

    if (isMaintenance) area.maintenanceMinutes += minutes;
    if (isFollowUp) area.followUpMinutes += minutes;
    area.technicianKeys.add(key);
    area.sessionCount += 1;
    areaGroups.set(areaKey, area);
  }

  const technicians = Array.from(technicianGroups.values())
    .map((technician) => ({
      technicianId: technician.technicianId,
      technicianName: technician.technicianName,
      maintenanceMinutes: round2(technician.maintenanceMinutes),
      followUpMinutes: round2(technician.followUpMinutes),
      totalPersonMinutes: round2(
        technician.maintenanceMinutes + technician.followUpMinutes,
      ),
      callCount: technician.callIds.size,
      sessionCount: technician.sessionCount,
      technicalAreas: Array.from(technician.technicalAreas).sort(),
      returnCycleSessions: technician.returnCycleSessions,
      activePhase: technician.activePhase,
    }))
    .sort(
      (current, next) =>
        next.totalPersonMinutes - current.totalPersonMinutes ||
        current.technicianName.localeCompare(next.technicianName, "pt-BR", {
          numeric: true,
        }),
    );

  const technicalAreas = Array.from(areaGroups.values())
    .map((area) => ({
      technicalArea: area.technicalArea,
      maintenanceMinutes: round2(area.maintenanceMinutes),
      followUpMinutes: round2(area.followUpMinutes),
      totalPersonMinutes: round2(
        area.maintenanceMinutes + area.followUpMinutes,
      ),
      technicianCount: area.technicianKeys.size,
      sessionCount: area.sessionCount,
    }))
    .sort(
      (current, next) =>
        next.totalPersonMinutes - current.totalPersonMinutes ||
        (current.technicalArea ?? "").localeCompare(
          next.technicalArea ?? "",
          "pt-BR",
        ),
    );

  const maintenancePersonMinutes = round2(
    technicians.reduce(
      (total, technician) => total + technician.maintenanceMinutes,
      0,
    ),
  );
  const followUpPersonMinutes = round2(
    technicians.reduce(
      (total, technician) => total + technician.followUpMinutes,
      0,
    ),
  );
  const totalPersonMinutes = round2(
    maintenancePersonMinutes + followUpPersonMinutes,
  );
  const totalMeasuredMinutes = phaseAwareMinutes + legacyMinutes;

  return {
    totals: {
      maintenancePersonMinutes,
      followUpPersonMinutes,
      totalPersonMinutes,
      technicianCount: technicians.length,
      callCount: callIds.size,
      activeSessionCount,
      returnCycleSessions: technicians.reduce(
        (total, technician) => total + technician.returnCycleSessions,
        0,
      ),
    },
    technicians,
    technicalAreas,
    coverage: {
      totalSessions: phaseAwareSessions + legacySessions,
      phaseAwareSessions,
      legacySessions,
      phaseAwareSessionPercent:
        phaseAwareSessions + legacySessions > 0
          ? round2(
              (phaseAwareSessions / (phaseAwareSessions + legacySessions)) * 100,
            )
          : null,
      phaseAwareMinutes: round2(phaseAwareMinutes),
      legacyMinutes: round2(legacyMinutes),
      phaseAwareMinutePercent:
        totalMeasuredMinutes > 0
          ? round2((phaseAwareMinutes / totalMeasuredMinutes) * 100)
          : null,
    },
  };
}
