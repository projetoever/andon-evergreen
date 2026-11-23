import { prisma } from "../db/prisma.js";
import { analyticsEligibility } from "./eligibility.js";
import { biMeasurementStartAt } from "./measurementBaseline.js";

/**
 * Applies the same start-of-measurement cohort to every BI route, including
 * overview, reliability, temporal, Machine360, drilldown and data-quality.
 *
 * The physical event itself must BEGIN after the baseline. A legacy event
 * ending after baseline may not be mistaken for a newly started failure.
 * This is not an archive deletion and has no effect on operational screens.
 */
export function withBiMeasurementStartAt(
  policy: ReturnType<typeof analyticsEligibility>,
  baseline: Date | null,
) {
  if (!baseline) return policy;
  return {
    callWhere: { AND: [policy.callWhere, { openedAt: { gte: baseline } }] },
    eventWhere: { AND: [policy.eventWhere, { startedAt: { gte: baseline } }] },
    eventOwnWhere: { AND: [policy.eventOwnWhere, { startedAt: { gte: baseline } }] },
  };
}

export async function loadAnalyticsEligibility() {
  const catalog = await prisma.failureClassification.findMany({
    select: { value: true, analyticsDisposition: true },
  });
  return withBiMeasurementStartAt(analyticsEligibility(catalog),biMeasurementStartAt());
}
