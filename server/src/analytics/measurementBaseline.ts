/**
 * RC23 BI measurement baseline.
 *
 * Opt-in, installer-persisted, UTC-only instant. This is a cohort boundary,
 * not a mutation or reclassification of historical calls/failure events.
 * Unset preserves prior behavior. Invalid input FAILS CLOSED: never silently
 * accept a mistyped date and accidentally reopen the legacy population.
 */
const STRICT_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function parseBiMeasurementStartAt(value: string | undefined | null): Date | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !STRICT_UTC_INSTANT.test(value))
    throw new Error("invalid_bi_measurement_start_at_utc");
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 19) !== value.slice(0, 19))
    throw new Error("invalid_bi_measurement_start_at_utc");
  return instant;
}

export function biMeasurementStartAt() {
  return parseBiMeasurementStartAt(process.env.ANDON_BI_MEASUREMENT_START_AT_UTC);
}

export function effectiveBiPeriodStart(requestedStart: Date, requestedEnd: Date, cutoff: Date | null): Date {
  if (!cutoff || cutoff <= requestedStart) return requestedStart;
  return new Date(Math.min(cutoff.getTime(), requestedEnd.getTime()));
}
