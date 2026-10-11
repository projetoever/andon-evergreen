const TIME_ZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

export type AnalyticsOverviewFilters = {
  machineId?: string;
  subtype?: string;
  classification?: string;
};

export type AnalyticsCallRecord = {
  id: string;
  machineId: string;
  subtype: string | null;
  status: string;
  openedAt: Date;
  attendedAt: Date | null;
  maintenanceCompletedAt: Date | null;
  finishedAt: Date | null;
  attendanceMinutes: number | null;
  postMaintenanceMinutes: number | null;
  maintenanceReturnCount: number;
  failureClassification: string | null;
  isSystemTest: boolean;
};

export type AnalyticsFailureEventRecord = {
  id: string;
  machineId: string;
  machineName: string;
  startedAt: Date;
  endedAt: Date | null;
  classification: string | null;
  callId: string | null;
  linkedCallIsSystemTest: boolean;
};

export type BuildExecutiveOverviewParams = {
  calls: AnalyticsCallRecord[];
  activeCallsNow: number | null;
  failureEvents: AnalyticsFailureEventRecord[];
  start: Date;
  end: Date;
  effectiveEnd: Date;
  generatedAt: Date;
  timeZone: string;
  filters: AnalyticsOverviewFilters;
};

type DowntimeInterval = {
  startMs: number;
  endMs: number;
};

type MachineDowntimeIntervals = {
  machineId: string;
  machineName: string;
  intervals: DowntimeInterval[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return round2(values.reduce((total, value) => total + value, 0) / values.length);
}

function diffMinutes(start: Date, end: Date) {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
}

function isInPeriod(value: Date | null, start: Date, end: Date) {
  if (!value) return false;
  const timestamp = value.getTime();
  return timestamp >= start.getTime() && timestamp < end.getTime();
}

function operationalDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Não foi possível converter a data para o fuso operacional");
  }

  return `${year}-${month}-${day}`;
}

function addOperationalDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTimeZoneOffsetMs(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((item) => item.type === type)?.value;
    if (!part) throw new Error("Não foi possível resolver o fuso operacional");
    return Number(part);
  };

  const asUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second"),
  );
  const normalizedInput = Math.floor(value.getTime() / 1000) * 1000;

  return asUtc - normalizedInput;
}

function operationalDayStart(dateKey: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(wallClockUtc), timeZone);
  let resultMs = wallClockUtc - firstOffset;
  const correctedOffset = getTimeZoneOffsetMs(new Date(resultMs), timeZone);

  if (correctedOffset !== firstOffset) {
    resultMs = wallClockUtc - correctedOffset;
  }

  return new Date(resultMs);
}

export function parseAnalyticsInstant(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized || !TIME_ZONE_SUFFIX_PATTERN.test(normalized)) return null;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildMergedDowntimeIntervalsByMachine(
  events: AnalyticsFailureEventRecord[],
  start: Date,
  end: Date,
) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const groups = new Map<string, MachineDowntimeIntervals>();

  if (endMs <= startMs) return groups;

  for (const event of events) {
    if (event.linkedCallIsSystemTest) continue;

    const intervalStart = Math.max(startMs, event.startedAt.getTime());
    const rawEnd = event.endedAt?.getTime() ?? endMs;
    const intervalEnd = Math.min(endMs, rawEnd);

    if (intervalEnd <= intervalStart) continue;

    const current = groups.get(event.machineId) ?? {
      machineId: event.machineId,
      machineName: event.machineName,
      intervals: [],
    };
    current.intervals.push({ startMs: intervalStart, endMs: intervalEnd });
    groups.set(event.machineId, current);
  }

  for (const group of groups.values()) {
    const sorted = [...group.intervals].sort((a, b) => a.startMs - b.startMs);
    const merged: DowntimeInterval[] = [];

    for (const interval of sorted) {
      const previous = merged[merged.length - 1];

      if (!previous || interval.startMs > previous.endMs) {
        merged.push({ ...interval });
        continue;
      }

      previous.endMs = Math.max(previous.endMs, interval.endMs);
    }

    group.intervals = merged;
  }

  return groups;
}

export function calculatePhysicalDowntimeByMachine(
  events: AnalyticsFailureEventRecord[],
  start: Date,
  end: Date,
) {
  const groups = buildMergedDowntimeIntervalsByMachine(events, start, end);

  return Array.from(groups.values())
    .map((group) => {
      const totalMs = group.intervals.reduce(
        (total, interval) => total + (interval.endMs - interval.startMs),
        0,
      );

      return {
        machineId: group.machineId,
        machineName: group.machineName,
        downtimeMinutes: round2(totalMs / 60_000),
      };
    })
    .sort(
      (current, next) =>
        next.downtimeMinutes - current.downtimeMinutes ||
        current.machineName.localeCompare(next.machineName, "pt-BR", { numeric: true }),
    );
}

export function calculatePhysicalDowntimeTrend(
  events: AnalyticsFailureEventRecord[],
  start: Date,
  end: Date,
  timeZone: string,
) {
  if (end.getTime() <= start.getTime()) return [];

  const totalsByDate = new Map<string, number>();
  const firstKey = operationalDateKey(start, timeZone);
  const lastKey = operationalDateKey(new Date(end.getTime() - 1), timeZone);
  let key = firstKey;

  for (let guard = 0; guard < 4000; guard += 1) {
    totalsByDate.set(key, 0);
    if (key === lastKey) break;
    key = addOperationalDays(key, 1);
  }

  const groups = buildMergedDowntimeIntervalsByMachine(events, start, end);

  for (const group of groups.values()) {
    for (const interval of group.intervals) {
      let cursor = interval.startMs;

      for (let guard = 0; cursor < interval.endMs && guard < 4000; guard += 1) {
        const dateKey = operationalDateKey(new Date(cursor), timeZone);
        const nextDateKey = addOperationalDays(dateKey, 1);
        const nextBoundary = operationalDayStart(nextDateKey, timeZone).getTime();
        const segmentEnd = Math.min(interval.endMs, nextBoundary);

        if (segmentEnd <= cursor) {
          throw new Error("Falha ao segmentar downtime pelo dia operacional");
        }

        totalsByDate.set(
          dateKey,
          (totalsByDate.get(dateKey) ?? 0) + (segmentEnd - cursor),
        );
        cursor = segmentEnd;
      }
    }
  }

  return Array.from(totalsByDate.entries())
    .map(([date, totalMs]) => ({
      date,
      downtimeMinutes: round2(totalMs / 60_000),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function countByLabel(values: Array<string | null>) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (current, next) =>
        next.count - current.count ||
        current.label.localeCompare(next.label, "pt-BR", { numeric: true }),
    );
}

export function buildExecutiveOverview(params: BuildExecutiveOverviewParams) {
  const {
    start,
    end,
    effectiveEnd,
    generatedAt,
    timeZone,
    filters,
    activeCallsNow,
  } = params;

  const calls = params.calls.filter((call) => !call.isSystemTest);
  const failureEvents = params.failureEvents.filter(
    (event) => !event.linkedCallIsSystemTest,
  );

  const openedCalls = calls.filter((call) => isInPeriod(call.openedAt, start, end));
  const attendedCalls = calls.filter((call) => isInPeriod(call.attendedAt, start, end));
  const finishedCalls = calls.filter(
    (call) => call.status === "finished" && isInPeriod(call.finishedAt, start, end),
  );

  const mttaValues = attendedCalls
    .filter((call) => call.attendedAt)
    .map((call) => diffMinutes(call.openedAt, call.attendedAt as Date));

  const maintenanceValues = finishedCalls
    .map((call) => call.attendanceMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const followUpValues = finishedCalls
    .map((call) => call.postMaintenanceMinutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const totalCallValues = finishedCalls
    .filter((call) => call.finishedAt)
    .map((call) => diffMinutes(call.openedAt, call.finishedAt as Date));

  const returnedCalls = finishedCalls.filter((call) => call.maintenanceReturnCount > 0);
  const maintenanceReturnCycles = finishedCalls.reduce(
    (total, call) => total + Math.max(0, call.maintenanceReturnCount),
    0,
  );

  const downtimeByMachine = calculatePhysicalDowntimeByMachine(
    failureEvents,
    start,
    effectiveEnd,
  );
  const failureOccurrences = failureEvents.filter((event) =>
    isInPeriod(event.startedAt, start, effectiveEnd),
  );

  const occurrencesByMachine = new Map<string, number>();
  for (const event of failureOccurrences) {
    occurrencesByMachine.set(
      event.machineId,
      (occurrencesByMachine.get(event.machineId) ?? 0) + 1,
    );
  }

  const machinePareto = downtimeByMachine.map((machine) => ({
    ...machine,
    occurrences: occurrencesByMachine.get(machine.machineId) ?? 0,
  }));

  const trendMap = new Map<
    string,
    { date: string; callsOpened: number; callsFinished: number }
  >();

  for (const call of openedCalls) {
    const key = operationalDateKey(call.openedAt, timeZone);
    const item = trendMap.get(key) ?? { date: key, callsOpened: 0, callsFinished: 0 };
    item.callsOpened += 1;
    trendMap.set(key, item);
  }

  for (const call of finishedCalls) {
    const key = operationalDateKey(call.finishedAt as Date, timeZone);
    const item = trendMap.get(key) ?? { date: key, callsOpened: 0, callsFinished: 0 };
    item.callsFinished += 1;
    trendMap.set(key, item);
  }

  const totalDowntimeMinutes = round2(
    downtimeByMachine.reduce((total, machine) => total + machine.downtimeMinutes, 0),
  );

  return {
    meta: {
      metricDefinitionVersion: "bi-mvp-3",
      generatedAt: generatedAt.toISOString(),
      timeZone,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        effectiveEnd: effectiveEnd.toISOString(),
      },
      filters,
      exclusions: {
        systemTests: true,
      },
      semantics: {
        mtta: "attendedAt - openedAt para atendimentos iniciados no período",
        maintenanceTime:
          "attendanceMinutes persistido para chamados finalizados no período",
        downtime:
          "união temporal de FailureEvent por máquina, recortada ao período, sem dupla contagem",
        activeCalls:
          "snapshot atual; quando há filtro de classificação o valor pode ser indisponível",
      },
    },
    kpis: {
      callsOpened: openedCalls.length,
      activeCallsNow,
      callsFinished: finishedCalls.length,
      mttaMinutes: average(mttaValues),
      avgMaintenanceMinutes: average(maintenanceValues),
      avgPostMaintenanceMinutes: average(followUpValues),
      avgTotalCallMinutes: average(totalCallValues),
      downtimeMinutes: totalDowntimeMinutes,
      failureOccurrences: failureOccurrences.length,
      returnedCalls: returnedCalls.length,
      maintenanceReturnCycles,
      maintenanceReturnRatePercent:
        finishedCalls.length > 0
          ? round2((returnedCalls.length / finishedCalls.length) * 100)
          : null,
    },
    trend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    downtimeTrend: calculatePhysicalDowntimeTrend(
      failureEvents,
      start,
      effectiveEnd,
      timeZone,
    ),
    machinePareto,
    classificationPareto: countByLabel(
      finishedCalls.map((call) => call.failureClassification),
    ),
    sectorDistribution: countByLabel(openedCalls.map((call) => call.subtype)),
    coverage: {
      mttaSampleSize: mttaValues.length,
      maintenanceTimeSampleSize: maintenanceValues.length,
      finishedCalls: finishedCalls.length,
      finishedCallsWithClassification: finishedCalls.filter(
        (call) => Boolean(call.failureClassification),
      ).length,
      failureEventsOverlappingPeriod: failureEvents.length,
      failureEventsWithClassification: failureEvents.filter(
        (event) => Boolean(event.classification),
      ).length,
      failureEventsLinkedToCalls: failureEvents.filter((event) => Boolean(event.callId)).length,
    },
  };
}

export type ExecutiveOverview = ReturnType<typeof buildExecutiveOverview>;

function comparisonMetric(current: number | null, previous: number | null) {
  if (current === null || previous === null) {
    return {
      current,
      previous,
      deltaPercent: null,
      direction: "unavailable" as const,
    };
  }

  if (previous === 0) {
    return {
      current,
      previous,
      deltaPercent: current === 0 ? 0 : null,
      direction: current === 0 ? ("flat" as const) : ("new" as const),
    };
  }

  const deltaPercent = round2(((current - previous) / Math.abs(previous)) * 100);
  return {
    current,
    previous,
    deltaPercent,
    direction:
      deltaPercent > 0
        ? ("up" as const)
        : deltaPercent < 0
          ? ("down" as const)
          : ("flat" as const),
  };
}

export function buildOverviewComparison(
  current: ExecutiveOverview,
  previous: ExecutiveOverview,
) {
  const currentReturnRate = current.kpis.maintenanceReturnRatePercent;
  const previousReturnRate = previous.kpis.maintenanceReturnRatePercent;

  return {
    callsOpened: comparisonMetric(current.kpis.callsOpened, previous.kpis.callsOpened),
    downtimeMinutes: comparisonMetric(
      current.kpis.downtimeMinutes,
      previous.kpis.downtimeMinutes,
    ),
    mttaMinutes: comparisonMetric(current.kpis.mttaMinutes, previous.kpis.mttaMinutes),
    maintenanceReturnRate: {
      current: currentReturnRate,
      previous: previousReturnRate,
      deltaPoints:
        currentReturnRate !== null && previousReturnRate !== null
          ? round2(currentReturnRate - previousReturnRate)
          : null,
    },
  };
}

export function buildExecutiveHighlights(overview: ExecutiveOverview) {
  const topMachine = overview.machinePareto[0] ?? null;
  const totalDowntime = overview.kpis.downtimeMinutes;
  const topClassification = overview.classificationPareto[0] ?? null;
  const classifiedTotal = overview.classificationPareto.reduce(
    (total, item) => total + item.count,
    0,
  );
  const topSector = overview.sectorDistribution[0] ?? null;
  const sectorTotal = overview.sectorDistribution.reduce(
    (total, item) => total + item.count,
    0,
  );

  return {
    topMachine: topMachine
      ? {
          ...topMachine,
          sharePercent:
            totalDowntime > 0
              ? round2((topMachine.downtimeMinutes / totalDowntime) * 100)
              : 0,
        }
      : null,
    topClassification: topClassification
      ? {
          classification: topClassification.label,
          count: topClassification.count,
          sharePercent:
            classifiedTotal > 0
              ? round2((topClassification.count / classifiedTotal) * 100)
              : 0,
        }
      : null,
    topSector: topSector
      ? {
          subtype: topSector.label,
          count: topSector.count,
          sharePercent:
            sectorTotal > 0 ? round2((topSector.count / sectorTotal) * 100) : 0,
        }
      : null,
  };
}
