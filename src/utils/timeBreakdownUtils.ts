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

export function calculateProductionModeBreakdownForPeriod(
  params: ProductionBreakdownParams,
): ProductionModeBreakdown {
  const bounds = getPeriodBounds(params);
  if (!bounds) return { scheduledSeconds: 0, notScheduledSeconds: 0, unknownSeconds: 0 };

  const totalSeconds = Math.floor((bounds.end - bounds.start) / 1000);
  if (totalSeconds <= 0) return { scheduledSeconds: 0, notScheduledSeconds: 0, unknownSeconds: 0 };

  const history = (params.productionHistory ?? []).filter((event) => !!toValidDate(event.startedAt));
  if (history.length === 0) {
    if (params.fallbackProductionMode === "scheduled") {
      return { scheduledSeconds: totalSeconds, notScheduledSeconds: 0, unknownSeconds: 0 };
    }
    if (params.fallbackProductionMode === "not_scheduled") {
      return { scheduledSeconds: 0, notScheduledSeconds: totalSeconds, unknownSeconds: 0 };
    }
    return { scheduledSeconds: 0, notScheduledSeconds: 0, unknownSeconds: totalSeconds };
  }

  let scheduledSeconds = 0;
  let notScheduledSeconds = 0;

  for (const event of history) {
    const eventStart = toValidDate(event.startedAt);
    if (!eventStart) continue;
    const eventEnd = toValidDate(event.endedAt ?? null) ?? (params.now ?? new Date());
    const seconds = overlapSeconds(bounds.start, bounds.end, eventStart.getTime(), eventEnd.getTime());
    if (seconds <= 0) continue;

    if (event.mode === "scheduled") scheduledSeconds += seconds;
    if (event.mode === "not_scheduled") notScheduledSeconds += seconds;
  }

  let knownSeconds = scheduledSeconds + notScheduledSeconds;
  if (knownSeconds > totalSeconds) {
    const scale = totalSeconds / knownSeconds;
    scheduledSeconds = Math.floor(scheduledSeconds * scale);
    notScheduledSeconds = Math.floor(notScheduledSeconds * scale);
    knownSeconds = scheduledSeconds + notScheduledSeconds;
  }

  const unknownSeconds = Math.max(0, totalSeconds - knownSeconds);
  return { scheduledSeconds, notScheduledSeconds, unknownSeconds };
}

export function calculateMachineConditionBreakdownForPeriod(
  params: ConditionBreakdownParams,
): MachineConditionBreakdown {
  const bounds = getPeriodBounds(params);
  if (!bounds) return { failureSeconds: 0, readySeconds: 0, unknownSeconds: 0 };

  const totalSeconds = Math.floor((bounds.end - bounds.start) / 1000);
  if (totalSeconds <= 0) return { failureSeconds: 0, readySeconds: 0, unknownSeconds: 0 };

  const history = params.stopHistory ?? [];
  if (history.length === 0) {
    if (params.fallbackMachineCondition === "stopped") {
      return { failureSeconds: totalSeconds, readySeconds: 0, unknownSeconds: 0 };
    }
    if (params.fallbackMachineCondition === "running") {
      return { failureSeconds: 0, readySeconds: totalSeconds, unknownSeconds: 0 };
    }
    return { failureSeconds: 0, readySeconds: 0, unknownSeconds: totalSeconds };
  }

  let failureSeconds = 0;
  for (const event of history) {
    const eventStart = toValidDate(event.stoppedAt);
    if (!eventStart) continue;
    const eventEnd = toValidDate(event.resumedAt ?? null) ?? (params.now ?? new Date());
    failureSeconds += overlapSeconds(bounds.start, bounds.end, eventStart.getTime(), eventEnd.getTime());
  }

  if (failureSeconds > totalSeconds) {
    failureSeconds = totalSeconds;
  }

  const readySeconds = Math.max(0, totalSeconds - failureSeconds);
  return { failureSeconds, readySeconds, unknownSeconds: 0 };
}

export function formatBreakdownSecondsToMinutesLabel(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)} min`;
}
