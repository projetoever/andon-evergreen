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

export function calculateOperationalImpactBreakdown(params: OperationalImpactParams): OperationalImpactBreakdown {
  const condition = calculateMachineConditionBreakdownForPeriod({
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    stopHistory: params.stopHistory,
    fallbackMachineCondition: params.fallbackMachineCondition,
    now: params.now,
  });

  const production = calculateProductionModeBreakdownForPeriod({
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    productionHistory: params.productionHistory,
    fallbackProductionMode: params.fallbackProductionMode,
    now: params.now,
  });

  const totalSeconds = condition.failureSeconds + condition.readySeconds + condition.unknownSeconds;
  if (totalSeconds <= 0) {
    return {
      productiveDowntimeSeconds: 0,
      nonScheduledDowntimeSeconds: 0,
      productionBlockedSupportSeconds: 0,
      nonScheduledSupportSeconds: 0,
      unknownSeconds: 0,
    };
  }

  const scale = (a: number, b: number) => Math.floor((a * b) / totalSeconds);

  const productiveDowntimeSeconds = scale(condition.failureSeconds, production.scheduledSeconds);
  const nonScheduledDowntimeSeconds = scale(condition.failureSeconds, production.notScheduledSeconds);
  const productionBlockedSupportSeconds = scale(condition.readySeconds, production.scheduledSeconds);
  const nonScheduledSupportSeconds = scale(condition.readySeconds, production.notScheduledSeconds);

  const classified =
    productiveDowntimeSeconds +
    nonScheduledDowntimeSeconds +
    productionBlockedSupportSeconds +
    nonScheduledSupportSeconds;

  const remainingSeconds = Math.max(0, totalSeconds - classified);

  let adjustedProductiveDowntimeSeconds = productiveDowntimeSeconds;
  let adjustedNonScheduledDowntimeSeconds = nonScheduledDowntimeSeconds;
  let adjustedProductionBlockedSupportSeconds = productionBlockedSupportSeconds;
  let adjustedNonScheduledSupportSeconds = nonScheduledSupportSeconds;

  if (remainingSeconds > 0) {
    const fallbackIsFailure = condition.failureSeconds >= condition.readySeconds;
    const fallbackIsScheduled = production.scheduledSeconds >= production.notScheduledSeconds;

    if (fallbackIsFailure && fallbackIsScheduled) adjustedProductiveDowntimeSeconds += remainingSeconds;
    if (fallbackIsFailure && !fallbackIsScheduled) adjustedNonScheduledDowntimeSeconds += remainingSeconds;
    if (!fallbackIsFailure && fallbackIsScheduled) adjustedProductionBlockedSupportSeconds += remainingSeconds;
    if (!fallbackIsFailure && !fallbackIsScheduled) adjustedNonScheduledSupportSeconds += remainingSeconds;
  }

  return {
    productiveDowntimeSeconds: adjustedProductiveDowntimeSeconds,
    nonScheduledDowntimeSeconds: adjustedNonScheduledDowntimeSeconds,
    productionBlockedSupportSeconds: adjustedProductionBlockedSupportSeconds,
    nonScheduledSupportSeconds: adjustedNonScheduledSupportSeconds,
    unknownSeconds: 0,
  };
}

export function formatBreakdownDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secondsRemainder = safeSeconds % 60;
  if (minutes === 0) return `${secondsRemainder} s`;
  return `${minutes} min ${secondsRemainder.toString().padStart(2, "0")} s`;
}
