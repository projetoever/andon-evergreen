import type { MachineStatus, MachineStopEvent, ProductionMode, MachineProductionEvent } from "@/types/machine";

interface BasePeriodParams {
  periodStart: string;
  periodEnd?: string | null;
  now?: Date;
}

interface ProductionBreakdownParams extends BasePeriodParams {
  productionHistory?: MachineProductionEvent[];
  fallbackProductionMode?: ProductionMode | null;
}

interface ConditionBreakdownParams extends BasePeriodParams {
  stopHistory?: MachineStopEvent[];
  fallbackMachineCondition?: MachineStatus | null;
}

interface OperationalImpactParams extends BasePeriodParams {
  stopHistory?: MachineStopEvent[];
  productionHistory?: MachineProductionEvent[];
  fallbackMachineCondition?: MachineStatus | null;
  fallbackProductionMode?: ProductionMode | null;
}

export interface ProductionModeBreakdown {
  scheduledSeconds: number;
  notScheduledSeconds: number;
  unknownSeconds: number;
}

export interface MachineConditionBreakdown {
  failureSeconds: number;
  readySeconds: number;
  unknownSeconds: number;
}

export interface OperationalImpactBreakdown {
  productiveDowntimeSeconds: number;
  nonScheduledDowntimeSeconds: number;
  productionBlockedSupportSeconds: number;
  nonScheduledSupportSeconds: number;
  unknownSeconds: number;
}

function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodBounds(params: BasePeriodParams): { start: number; end: number } | null {
  const startDate = toValidDate(params.periodStart);
  if (!startDate) return null;

  const effectiveEnd = params.periodEnd ?? params.now?.toISOString() ?? new Date().toISOString();
  const endDate = toValidDate(effectiveEnd);
  if (!endDate) return null;

  const start = startDate.getTime();
  const end = endDate.getTime();
  if (end <= start) return { start, end: start };
  return { start, end };
}

function overlapSeconds(startA: number, endA: number, startB: number, endB: number): number {
  const overlapMs = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
  return Math.floor(overlapMs / 1000);
}

export function calculateProductionModeBreakdownForPeriod(params: ProductionBreakdownParams): ProductionModeBreakdown {
  const bounds = getPeriodBounds(params);
  if (!bounds) return { scheduledSeconds: 0, notScheduledSeconds: 0, unknownSeconds: 0 };

  const totalSeconds = Math.floor((bounds.end - bounds.start) / 1000);
  if (totalSeconds <= 0) return { scheduledSeconds: 0, notScheduledSeconds: 0, unknownSeconds: 0 };

  const history = (params.productionHistory ?? []).filter((event) => !!toValidDate(event.startedAt));
  if (history.length === 0) {
    if (params.fallbackProductionMode === "scheduled") return { scheduledSeconds: totalSeconds, notScheduledSeconds: 0, unknownSeconds: 0 };
    if (params.fallbackProductionMode === "not_scheduled") return { scheduledSeconds: 0, notScheduledSeconds: totalSeconds, unknownSeconds: 0 };
    return { scheduledSeconds: totalSeconds, notScheduledSeconds: 0, unknownSeconds: 0 };
  }

  let scheduledSeconds = 0;
  let notScheduledSeconds = 0;
  let matchedOverlapSeconds = 0;

  for (const event of history) {
    const eventStart = toValidDate(event.startedAt);
    if (!eventStart) continue;
    const eventEnd = toValidDate(event.endedAt ?? null) ?? (params.now ?? new Date());
    const seconds = overlapSeconds(bounds.start, bounds.end, eventStart.getTime(), eventEnd.getTime());
    if (seconds <= 0) continue;
    matchedOverlapSeconds += seconds;
    if (event.productionMode === "scheduled") scheduledSeconds += seconds;
    if (event.productionMode === "not_scheduled") notScheduledSeconds += seconds;
  }

  if (matchedOverlapSeconds === 0) {
    if (params.fallbackProductionMode === "scheduled") return { scheduledSeconds: totalSeconds, notScheduledSeconds: 0, unknownSeconds: 0 };
    if (params.fallbackProductionMode === "not_scheduled") return { scheduledSeconds: 0, notScheduledSeconds: totalSeconds, unknownSeconds: 0 };
    return { scheduledSeconds: totalSeconds, notScheduledSeconds: 0, unknownSeconds: 0 };
  }

  let knownSeconds = scheduledSeconds + notScheduledSeconds;
  if (knownSeconds > totalSeconds) {
    const scale = totalSeconds / knownSeconds;
    scheduledSeconds = Math.floor(scheduledSeconds * scale);
    notScheduledSeconds = Math.floor(notScheduledSeconds * scale);
    knownSeconds = scheduledSeconds + notScheduledSeconds;
  }

  const remainingSeconds = Math.max(0, totalSeconds - knownSeconds);
  if (remainingSeconds > 0) {
    const fallbackMode = params.fallbackProductionMode ?? "scheduled";
    if (fallbackMode === "not_scheduled") notScheduledSeconds += remainingSeconds;
    else scheduledSeconds += remainingSeconds;
  }

  return {
    scheduledSeconds,
    notScheduledSeconds,
    unknownSeconds: 0,
  };
}

export function calculateMachineConditionBreakdownForPeriod(params: ConditionBreakdownParams): MachineConditionBreakdown {
  const bounds = getPeriodBounds(params);
  if (!bounds) return { failureSeconds: 0, readySeconds: 0, unknownSeconds: 0 };

  const totalSeconds = Math.floor((bounds.end - bounds.start) / 1000);
  if (totalSeconds <= 0) return { failureSeconds: 0, readySeconds: 0, unknownSeconds: 0 };

  const history = params.stopHistory ?? [];
  if (history.length === 0) {
    if (params.fallbackMachineCondition === "stopped") return { failureSeconds: totalSeconds, readySeconds: 0, unknownSeconds: 0 };
    if (params.fallbackMachineCondition === "running") return { failureSeconds: 0, readySeconds: totalSeconds, unknownSeconds: 0 };
    return { failureSeconds: 0, readySeconds: totalSeconds, unknownSeconds: 0 };
  }

  let failureSeconds = 0;
  let matchedOverlapSeconds = 0;
  for (const event of history) {
    const eventStart = toValidDate(event.stoppedAt);
    if (!eventStart) continue;
    const eventEnd = toValidDate(event.resumedAt ?? null) ?? (params.now ?? new Date());
    const seconds = overlapSeconds(bounds.start, bounds.end, eventStart.getTime(), eventEnd.getTime());
    if (seconds <= 0) continue;
    matchedOverlapSeconds += seconds;
    failureSeconds += seconds;
  }

  if (matchedOverlapSeconds === 0) {
    if (params.fallbackMachineCondition === "stopped") return { failureSeconds: totalSeconds, readySeconds: 0, unknownSeconds: 0 };
    if (params.fallbackMachineCondition === "running") return { failureSeconds: 0, readySeconds: totalSeconds, unknownSeconds: 0 };
    return { failureSeconds: 0, readySeconds: totalSeconds, unknownSeconds: 0 };
  }

  failureSeconds = Math.min(totalSeconds, failureSeconds);
  return { failureSeconds, readySeconds: Math.max(0, totalSeconds - failureSeconds), unknownSeconds: 0 };
}

type OperationalImpactCategory =
  | "productiveDowntimeSeconds"
  | "nonScheduledDowntimeSeconds"
  | "productionBlockedSupportSeconds"
  | "nonScheduledSupportSeconds";

const OPERATIONAL_IMPACT_CATEGORIES: OperationalImpactCategory[] = [
  "productiveDowntimeSeconds",
  "nonScheduledDowntimeSeconds",
  "productionBlockedSupportSeconds",
  "nonScheduledSupportSeconds",
];

function clampBoundary(boundaries: Set<number>, value: number, periodStart: number, periodEnd: number) {
  if (value > periodStart && value < periodEnd) boundaries.add(value);
}

function getRelevantStopEvents(
  stopHistory: MachineStopEvent[] | undefined,
  periodStart: number,
  periodEnd: number,
  now: Date,
): MachineStopEvent[] {
  return (stopHistory ?? []).filter((event) => {
    const eventStart = toValidDate(event.stoppedAt);
    if (!eventStart) return false;
    const eventEnd = toValidDate(event.resumedAt ?? null) ?? now;
    return eventEnd.getTime() > periodStart && eventStart.getTime() < periodEnd;
  });
}

function getRelevantProductionEvents(
  productionHistory: MachineProductionEvent[] | undefined,
  periodStart: number,
  periodEnd: number,
  now: Date,
): MachineProductionEvent[] {
  return (productionHistory ?? []).filter((event) => {
    const eventStart = toValidDate(event.startedAt);
    if (!eventStart) return false;
    const eventEnd = toValidDate(event.endedAt ?? null) ?? now;
    return eventEnd.getTime() > periodStart && eventStart.getTime() < periodEnd;
  });
}

function getMachineConditionAtTimestamp(
  timestamp: number,
  relevantStopEvents: MachineStopEvent[],
  fallbackMachineCondition: MachineStatus | null | undefined,
  now: Date,
): MachineStatus {
  const isInsideStopEvent = relevantStopEvents.some((event) => {
    const eventStart = toValidDate(event.stoppedAt);
    if (!eventStart) return false;
    const eventEnd = toValidDate(event.resumedAt ?? null) ?? now;
    return timestamp >= eventStart.getTime() && timestamp < eventEnd.getTime();
  });

  if (isInsideStopEvent) return "stopped";
  return fallbackMachineCondition === "stopped" && relevantStopEvents.length === 0 ? "stopped" : "running";
}

function getProductionModeAtTimestamp(
  timestamp: number,
  relevantProductionEvents: MachineProductionEvent[],
  fallbackProductionMode: ProductionMode | null | undefined,
  now: Date,
): ProductionMode {
  const fallbackMode = fallbackProductionMode === "not_scheduled" ? "not_scheduled" : "scheduled";

  const matchingEvent = relevantProductionEvents.find((event) => {
    const eventStart = toValidDate(event.startedAt);
    if (!eventStart) return false;
    const eventEnd = toValidDate(event.endedAt ?? null) ?? now;
    return timestamp >= eventStart.getTime() && timestamp < eventEnd.getTime();
  });

  return matchingEvent?.productionMode ?? fallbackMode;
}

function finalizeOperationalImpactSeconds(
  categoryMilliseconds: Record<OperationalImpactCategory, number>,
  totalSeconds: number,
): OperationalImpactBreakdown {
  const result: Record<OperationalImpactCategory, number> = {
    productiveDowntimeSeconds: 0,
    nonScheduledDowntimeSeconds: 0,
    productionBlockedSupportSeconds: 0,
    nonScheduledSupportSeconds: 0,
  };

  const remainders = OPERATIONAL_IMPACT_CATEGORIES.map((category) => {
    const milliseconds = Math.max(0, categoryMilliseconds[category]);
    result[category] = Math.floor(milliseconds / 1000);
    return { category, remainder: milliseconds % 1000, milliseconds };
  }).sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return b.milliseconds - a.milliseconds;
  });

  let classifiedSeconds = OPERATIONAL_IMPACT_CATEGORIES.reduce((total, category) => total + result[category], 0);
  let remainingSeconds = Math.max(0, totalSeconds - classifiedSeconds);
  let index = 0;

  while (remainingSeconds > 0 && remainders.length > 0) {
    result[remainders[index % remainders.length].category] += 1;
    remainingSeconds -= 1;
    index += 1;
  }

  return {
    productiveDowntimeSeconds: result.productiveDowntimeSeconds,
    nonScheduledDowntimeSeconds: result.nonScheduledDowntimeSeconds,
    productionBlockedSupportSeconds: result.productionBlockedSupportSeconds,
    nonScheduledSupportSeconds: result.nonScheduledSupportSeconds,
    unknownSeconds: 0,
  };
}

export function calculateOperationalImpactBreakdown(params: OperationalImpactParams): OperationalImpactBreakdown {
  const bounds = getPeriodBounds(params);
  if (!bounds) {
    return {
      productiveDowntimeSeconds: 0,
      nonScheduledDowntimeSeconds: 0,
      productionBlockedSupportSeconds: 0,
      nonScheduledSupportSeconds: 0,
      unknownSeconds: 0,
    };
  }

  const totalSeconds = Math.floor((bounds.end - bounds.start) / 1000);
  if (totalSeconds <= 0) {
    return {
      productiveDowntimeSeconds: 0,
      nonScheduledDowntimeSeconds: 0,
      productionBlockedSupportSeconds: 0,
      nonScheduledSupportSeconds: 0,
      unknownSeconds: 0,
    };
  }

  const now = params.now ?? new Date();
  const relevantStopEvents = getRelevantStopEvents(params.stopHistory, bounds.start, bounds.end, now);
  const relevantProductionEvents = getRelevantProductionEvents(params.productionHistory, bounds.start, bounds.end, now);

  const boundaries = new Set<number>([bounds.start, bounds.end]);

  for (const event of relevantStopEvents) {
    const eventStart = toValidDate(event.stoppedAt);
    const eventEnd = toValidDate(event.resumedAt ?? null) ?? now;
    if (eventStart) clampBoundary(boundaries, eventStart.getTime(), bounds.start, bounds.end);
    clampBoundary(boundaries, eventEnd.getTime(), bounds.start, bounds.end);
  }

  for (const event of relevantProductionEvents) {
    const eventStart = toValidDate(event.startedAt);
    const eventEnd = toValidDate(event.endedAt ?? null) ?? now;
    if (eventStart) clampBoundary(boundaries, eventStart.getTime(), bounds.start, bounds.end);
    clampBoundary(boundaries, eventEnd.getTime(), bounds.start, bounds.end);
  }

  const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

  const categoryMilliseconds: Record<OperationalImpactCategory, number> = {
    productiveDowntimeSeconds: 0,
    nonScheduledDowntimeSeconds: 0,
    productionBlockedSupportSeconds: 0,
    nonScheduledSupportSeconds: 0,
  };

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const segmentStart = sortedBoundaries[index];
    const segmentEnd = sortedBoundaries[index + 1];
    const segmentMs = Math.max(0, segmentEnd - segmentStart);
    if (segmentMs <= 0) continue;

    const machineCondition = getMachineConditionAtTimestamp(
      segmentStart,
      relevantStopEvents,
      params.fallbackMachineCondition,
      now,
    );

    const productionMode = getProductionModeAtTimestamp(
      segmentStart,
      relevantProductionEvents,
      params.fallbackProductionMode,
      now,
    );

    const isStopped = machineCondition === "stopped";
    const isScheduled = productionMode === "scheduled";

    if (isStopped && isScheduled) categoryMilliseconds.productiveDowntimeSeconds += segmentMs;
    else if (isStopped && !isScheduled) categoryMilliseconds.nonScheduledDowntimeSeconds += segmentMs;
    else if (!isStopped && isScheduled) categoryMilliseconds.productionBlockedSupportSeconds += segmentMs;
    else categoryMilliseconds.nonScheduledSupportSeconds += segmentMs;
  }

  return finalizeOperationalImpactSeconds(categoryMilliseconds, totalSeconds);
}

export function formatBreakdownDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secondsRemainder = safeSeconds % 60;
  if (minutes === 0) return `${secondsRemainder} s`;
  return `${minutes} min ${secondsRemainder.toString().padStart(2, "0")} s`;
}
