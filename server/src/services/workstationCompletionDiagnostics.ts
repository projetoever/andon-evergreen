export type MaintenanceStationSession = {
  workstationId: string | null;
  cycleIndex: number | null;
  endedAt: Date | null;
  phase: string | null;
  workstation?: { name: string | null; active: boolean } | null;
};

export type DiagnosticStation = {
  suffix: string;
  name: string | null;
  active: boolean | null;
};

const suffix = (id: string) => id.slice(-8);

/**
 * Mirrors the existing finish-maintenance rule without mutating any record.
 * This is an advisory diagnostic; the real transition always rechecks in
 * server/src/services/workstationAuthorization.ts within a transaction.
 */
export function describeMaintenanceStationAuthorization(
  sessions: readonly MaintenanceStationSession[],
  currentStationId: string | null,
  currentStationActive: boolean | null,
  restricted: boolean,
) {
  const maintenance = sessions.filter((entry) => entry.phase !== "follow_up");
  const latestCycle = Math.max(1, ...maintenance.map((entry) => entry.cycleIndex ?? 1));
  const cycleSessions = maintenance.filter((entry) => (entry.cycleIndex ?? 1) === latestCycle);
  const activeSessions = cycleSessions.filter((entry) => entry.endedAt === null);
  const relevant = activeSessions.length ? activeSessions : cycleSessions;
  const authorizedSessions = relevant.filter(
    (entry): entry is MaintenanceStationSession & { workstationId: string } =>
      Boolean(entry.workstationId),
  );
  const unique = new Map<string, DiagnosticStation>();
  for (const entry of authorizedSessions) {
    unique.set(entry.workstationId, {
      suffix: suffix(entry.workstationId),
      name: entry.workstation?.name ?? null,
      active: entry.workstation?.active ?? null,
    });
  }

  const outcome =
    !restricted ? "restriction_off" :
    unique.size === 0 ? "legacy_no_provenance" :
    !currentStationId || currentStationActive === null ? "unidentified" :
    !currentStationActive ? "inactive" :
    unique.has(currentStationId) ? "authorized" : "different_workstation";

  return {
    latestCycle,
    activeMaintenanceSessions: activeSessions.length,
    authorizedStations: [...unique.values()],
    currentStationSuffix: currentStationId ? suffix(currentStationId) : null,
    currentStationActive,
    outcome,
    // This must not be used as an authorization decision. It is for admins
    // diagnosing browser UUID drift, without exposing any complete station ID.
  } as const;
}
