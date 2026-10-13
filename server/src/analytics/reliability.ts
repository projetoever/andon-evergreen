export type ReliabilityMachineRecord = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
};

export type ReliabilityFailureEventRecord = {
  id: string;
  machineId: string;
  startedAt: Date;
  endedAt: Date | null;
  classification: string | null;
  callId: string | null;
};

export type ReliabilityCallRecord = {
  id: string;
  machineId: string;
  status: string;
  openedAt: Date;
  finishedAt: Date | null;
  failureClassification: string | null;
  maintenanceReturnCount: number;
};

export type ReliabilityActiveSessionRecord = {
  id: string;
  machineId: string;
  startedAt: Date;
};

export type BuildAssetReliabilityParams = {
  machines: ReliabilityMachineRecord[];
  failureEvents: ReliabilityFailureEventRecord[];
  calls: ReliabilityCallRecord[];
  activeCalls: ReliabilityCallRecord[] | null;
  activeSessions: ReliabilityActiveSessionRecord[] | null;
  start: Date;
  effectiveEnd: Date;
};

type Interval = {
  startMs: number;
  endMs: number;
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function minutesBetween(startMs: number, endMs: number) {
  return Math.max(0, round2((endMs - startMs) / 60_000));
}

function mergeIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const previous = merged[merged.length - 1];

    if (!previous || interval.startMs > previous.endMs) {
      merged.push({ ...interval });
      continue;
    }

    previous.endMs = Math.max(previous.endMs, interval.endMs);
  }

  return merged;
}

function groupedIntervals(
  events: ReliabilityFailureEventRecord[],
  start: Date,
  end: Date,
) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const byMachine = new Map<string, Interval[]>();

  for (const event of events) {
    const intervalStart = Math.max(startMs, event.startedAt.getTime());
    const intervalEnd = Math.min(
      endMs,
      event.endedAt?.getTime() ?? endMs,
    );

    if (intervalEnd <= intervalStart) continue;

    const current = byMachine.get(event.machineId) ?? [];
    current.push({ startMs: intervalStart, endMs: intervalEnd });
    byMachine.set(event.machineId, current);
  }

  for (const [machineId, intervals] of byMachine) {
    byMachine.set(machineId, mergeIntervals(intervals));
  }

  return byMachine;
}

function countRepeatDiagnoses(calls: ReliabilityCallRecord[]) {
  const counts = new Map<string, number>();

  for (const call of calls) {
    if (!call.failureClassification) continue;
    counts.set(
      call.failureClassification,
      (counts.get(call.failureClassification) ?? 0) + 1,
    );
  }

  return Array.from(counts.values()).reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
}

function topDiagnosis(calls: ReliabilityCallRecord[]) {
  const counts = new Map<string, number>();

  for (const call of calls) {
    if (!call.failureClassification) continue;
    counts.set(
      call.failureClassification,
      (counts.get(call.failureClassification) ?? 0) + 1,
    );
  }

  return Array.from(counts.entries())
    .map(([classification, count]) => ({ classification, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.classification.localeCompare(b.classification, "pt-BR"),
    )[0] ?? null;
}

export function buildAssetReliability({
  machines,
  failureEvents,
  calls,
  activeCalls,
  activeSessions,
  start,
  effectiveEnd,
}: BuildAssetReliabilityParams) {
  const effectiveEndMs = effectiveEnd.getTime();
  const intervalsByMachine = groupedIntervals(
    failureEvents,
    start,
    effectiveEnd,
  );
  const callsByMachine = new Map<string, ReliabilityCallRecord[]>();

  for (const call of calls) {
    const current = callsByMachine.get(call.machineId) ?? [];
    current.push(call);
    callsByMachine.set(call.machineId, current);
  }

  const activeCallsByMachine = new Map<string, ReliabilityCallRecord[]>();
  for (const call of activeCalls ?? []) {
    const current = activeCallsByMachine.get(call.machineId) ?? [];
    current.push(call);
    activeCallsByMachine.set(call.machineId, current);
  }

  const activeSessionsByMachine = new Map<string, ReliabilityActiveSessionRecord[]>();
  for (const session of activeSessions ?? []) {
    const current = activeSessionsByMachine.get(session.machineId) ?? [];
    current.push(session);
    activeSessionsByMachine.set(session.machineId, current);
  }

  const openEventsByMachine = new Map<string, ReliabilityFailureEventRecord[]>();
  for (const event of failureEvents) {
    if (event.endedAt) continue;
    const current = openEventsByMachine.get(event.machineId) ?? [];
    current.push(event);
    openEventsByMachine.set(event.machineId, current);
  }

  const assets = machines.map((machine) => {
    const intervals = intervalsByMachine.get(machine.id) ?? [];
    const downtimeMinutes = round2(
      intervals.reduce(
        (total, interval) => total + (interval.endMs - interval.startMs),
        0,
      ) / 60_000,
    );
    const physicalStopEpisodes = intervals.length;
    const exposureStartMs = Math.max(
      start.getTime(),
      machine.createdAt.getTime(),
    );
    const calendarExposureMinutes = minutesBetween(
      exposureStartMs,
      effectiveEndMs,
    );
    const operatingExposureMinutes = Math.max(
      0,
      round2(calendarExposureMinutes - downtimeMinutes),
    );
    const machineCalls = callsByMachine.get(machine.id) ?? [];
    const openedCalls = machineCalls.filter(
      (call) =>
        call.openedAt.getTime() >= start.getTime() &&
        call.openedAt.getTime() < effectiveEndMs,
    );
    const finishedCalls = machineCalls.filter(
      (call) =>
        call.status === "finished" &&
        call.finishedAt &&
        call.finishedAt.getTime() >= start.getTime() &&
        call.finishedAt.getTime() < effectiveEndMs,
    );
    const currentActiveCalls = activeCallsByMachine.get(machine.id) ?? [];
    const currentSessions = activeSessionsByMachine.get(machine.id) ?? [];
    const currentOpenEvents = openEventsByMachine.get(machine.id) ?? [];

    const oldestActiveCallMinutes = currentActiveCalls.length
      ? Math.max(
          ...currentActiveCalls.map((call) =>
            minutesBetween(call.openedAt.getTime(), effectiveEndMs),
          ),
        )
      : null;
    const oldestOpenFailureMinutes = currentOpenEvents.length
      ? Math.max(
          ...currentOpenEvents.map((event) =>
            minutesBetween(event.startedAt.getTime(), effectiveEndMs),
          ),
        )
      : null;
    const oldestActiveSessionMinutes = currentSessions.length
      ? Math.max(
          ...currentSessions.map((session) =>
            minutesBetween(session.startedAt.getTime(), effectiveEndMs),
          ),
        )
      : null;

    return {
      machineId: machine.id,
      machineName: machine.name,
      isActive: machine.isActive,
      downtimeMinutes,
      physicalStopEpisodes,
      mtbfEstimatedMinutes:
        physicalStopEpisodes > 0 && operatingExposureMinutes > 0
          ? round2(operatingExposureMinutes / physicalStopEpisodes)
          : null,
      avgDowntimePerEpisodeMinutes:
        physicalStopEpisodes > 0
          ? round2(downtimeMinutes / physicalStopEpisodes)
          : null,
      callsOpened: openedCalls.length,
      callsFinished: finishedCalls.length,
      maintenanceReturnCycles: finishedCalls.reduce(
        (total, call) => total + Math.max(0, call.maintenanceReturnCount),
        0,
      ),
      repeatDiagnosisCount: countRepeatDiagnoses(finishedCalls),
      topDiagnosis: topDiagnosis(finishedCalls),
      activeCallCount: activeCalls === null ? null : currentActiveCalls.length,
      oldestActiveCallMinutes:
        activeCalls === null ? null : oldestActiveCallMinutes,
      openFailureEventCount: currentOpenEvents.length,
      oldestOpenFailureMinutes,
      activeTechnicianSessionCount:
        activeSessions === null ? null : currentSessions.length,
      oldestActiveTechnicianSessionMinutes:
        activeSessions === null ? null : oldestActiveSessionMinutes,
    };
  });

  assets.sort(
    (a, b) =>
      b.downtimeMinutes - a.downtimeMinutes ||
      b.physicalStopEpisodes - a.physicalStopEpisodes ||
      (b.oldestActiveCallMinutes ?? 0) - (a.oldestActiveCallMinutes ?? 0) ||
      a.machineName.localeCompare(b.machineName, "pt-BR", { numeric: true }),
  );

  const activeCallAges =
    activeCalls?.map((call) =>
      minutesBetween(call.openedAt.getTime(), effectiveEndMs),
    ) ?? null;
  const openFailureAges = failureEvents
    .filter((event) => !event.endedAt)
    .map((event) => minutesBetween(event.startedAt.getTime(), effectiveEndMs));
  const activeSessionAges =
    activeSessions?.map((session) =>
      minutesBetween(session.startedAt.getTime(), effectiveEndMs),
    ) ?? null;
  const finishedCalls = calls.filter(
    (call) =>
      call.status === "finished" &&
      call.finishedAt &&
      call.finishedAt.getTime() >= start.getTime() &&
      call.finishedAt.getTime() < effectiveEndMs,
  );

  return {
    assets,
    dataHealth: {
      activeCallsOver24h:
        activeCallAges === null
          ? null
          : activeCallAges.filter((minutes) => minutes >= 24 * 60).length,
      oldestActiveCallMinutes:
        activeCallAges && activeCallAges.length
          ? Math.max(...activeCallAges)
          : activeCallAges === null
            ? null
            : 0,
      openFailureEvents: openFailureAges.length,
      openFailureEventsOver24h: openFailureAges.filter(
        (minutes) => minutes >= 24 * 60,
      ).length,
      oldestOpenFailureMinutes:
        openFailureAges.length ? Math.max(...openFailureAges) : 0,
      activeSessionsOver24h:
        activeSessionAges === null
          ? null
          : activeSessionAges.filter((minutes) => minutes >= 24 * 60).length,
      oldestActiveSessionMinutes:
        activeSessionAges && activeSessionAges.length
          ? Math.max(...activeSessionAges)
          : activeSessionAges === null
            ? null
            : 0,
      finishedCallsMissingClassification: finishedCalls.filter(
        (call) => !call.failureClassification,
      ).length,
      finishedCalls: finishedCalls.length,
      standaloneFailureEvents: failureEvents.filter(
        (event) => !event.callId,
      ).length,
    },
  };
}
