import { uniqueById } from "./eligibility.js";
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
  failureResponsibility?: string | null;
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
  return Math.max(
    0,
    (Math.min(end.getTime(), session.endedAt?.getTime() ?? end.getTime()) -
      Math.max(start.getTime(), session.startedAt.getTime())) /
      60_000,
  );
}

function measuredSessions(
  sessions: AnalyticsMaintenanceSessionRecord[],
  start: Date,
  end: Date,
) {
  const groups = new Map<string, AnalyticsMaintenanceSessionRecord[]>();
  for (const row of uniqueById(sessions)) {
    if (
      !Number.isFinite(clipSessionMinutes(row, start, end)) ||
      clipSessionMinutes(row, start, end) <= 0
    )
      continue;
    const key = technicianKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const result: AnalyticsMaintenanceSessionRecord[] = [];
  for (const group of groups.values()) {
    const points = [
      ...new Set(
        group.flatMap((row) => [
          Math.max(start.getTime(), row.startedAt.getTime()),
          Math.min(end.getTime(), row.endedAt?.getTime() ?? end.getTime()),
        ]),
      ),
    ].sort((a, b) => a - b);
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index],
        b = points[index + 1];
      const active = group.filter(
        (row) =>
          row.startedAt.getTime() < b &&
          (row.endedAt?.getTime() ?? Infinity) > a,
      );
      if (!active.length) continue;
      const phases = new Set(active.map((row) => row.phase));
      const areas = new Set(active.map((row) => row.technicalArea));
      const responsibilities = new Set(
        active.map((row) => row.failureResponsibility ?? "unassigned"),
      );
      // Stable representative is only identity/context, never a precedence for phase or cause.
      const row = [...active].sort((x, y) => x.id.localeCompare(y.id))[0];
      result.push({
        ...row,
        startedAt: new Date(a),
        endedAt: new Date(b),
        phase: phases.size === 1 ? row.phase : null,
        technicalArea: areas.size === 1 ? row.technicalArea : null,
        failureResponsibility:
          responsibilities.size === 1 ? [...responsibilities][0] : "unassigned",
      });
    }
  }
  return result;
}

function technicianKey(session: AnalyticsMaintenanceSessionRecord) {
  if (session.technicianId) return `id:${session.technicianId}`;
  return session.technicianName.trim() ? `legacy:${session.technicianName.trim().toLocaleLowerCase("pt-BR")}` : `unknown:${session.id}`;
}

export function buildMaintenanceParticipation({
  sessions,
  start,
  effectiveEnd,
}: BuildMaintenanceParticipationParams) {
  const rawSessions = uniqueById(sessions).filter(row => clipSessionMinutes(row, start, effectiveEnd) > 0);
  const measured = measuredSessions(rawSessions, start, effectiveEnd);
  const overlapMinutesRemoved = Math.max(0, rawSessions.reduce((sum,row)=>sum+clipSessionMinutes(row,start,effectiveEnd),0)-measured.reduce((sum,row)=>sum+clipSessionMinutes(row,start,effectiveEnd),0));
  const responsibilityMinutes = new Map<string,number>();
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

  for (const session of measured) {
    const minutes = clipSessionMinutes(session, start, effectiveEnd);
    if (minutes <= 0) continue;

    callIds.add(session.callId);
    const domain = session.failureResponsibility ?? "unassigned";
    responsibilityMinutes.set(domain,(responsibilityMinutes.get(domain)??0)+minutes);

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

  phaseAwareSessions = rawSessions.filter(row => row.phase === "maintenance" || row.phase === "follow_up").length;
  legacySessions = rawSessions.length - phaseAwareSessions;
  activeSessionCount = rawSessions.filter(row => !row.endedAt).length;
  callIds.clear(); rawSessions.forEach(row => callIds.add(row.callId));
  for (const [key, technician] of technicianGroups) {
    const raw = rawSessions.filter(row => technicianKey(row) === key);
    technician.callIds = new Set(raw.map(row => row.callId));
    technician.sessionCount = raw.length;
    technician.returnCycleSessions = raw.filter(row => row.phase === "maintenance" && (row.cycleIndex??1)>1).length;
    const active = raw.filter(row => !row.endedAt && ["maintenance","follow_up"].includes(row.phase??""))
      .sort((a,b) => b.startedAt.getTime()-a.startedAt.getTime());
    technician.activePhase = active[0]?.phase as "maintenance" | "follow_up" | undefined ?? null;
  }
  for (const area of areaGroups.values()) area.sessionCount = rawSessions.filter(row => row.technicalArea === area.technicalArea).length;
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

  const maintenancePersonMinutes = round2(measured.filter(row=>row.phase==="maintenance").reduce((sum,row)=>sum+clipSessionMinutes(row,start,effectiveEnd),0));
  const followUpPersonMinutes = round2(measured.filter(row=>row.phase==="follow_up").reduce((sum,row)=>sum+clipSessionMinutes(row,start,effectiveEnd),0));
  const totalPersonMinutes = round2(
    maintenancePersonMinutes + followUpPersonMinutes,
  );
  const totalMeasuredMinutes = phaseAwareMinutes + legacyMinutes;

  return {
    responsibility: [...responsibilityMinutes].map(([responsibility,personMinutes]) => ({responsibility, personMinutes:round2(personMinutes)})),
    totals: {
      overlapMinutesRemoved:round2(overlapMinutesRemoved),
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
