import type { Prisma } from "@prisma/client";

/**
 * A query constraint for candidate CORRECTIVE maintenance-call cohorts only.
 *
 * IMPORTANT: do not attach this predicate to all BI calls, physical failure
 * events, production downtime, or measured technician participation. Setup
 * and production support still belong to operational volumes and independently
 * measured physical downtime.
 *
 * Historical calls without a reason snapshot retain the established legacy
 * eligibility policy, not a new fabricated classification.
 *
 * This is a candidate prefilter, NOT proof for MTTR / MTBF: causal physical
 * episodes, confirmed maintenance responsibility, complete corrective
 * episode and system-test exclusions must STILL be checked in their existing
 * domain calculators.
 */
export const correctiveReasonCandidateWhere: Prisma.AndonCallWhereInput = {
  OR: [
    { callReasonSnapshot: { is: null } },
    {
      callReasonSnapshot: {
        is: {
          nature: "corrective_failure",
          maintenanceKpiPolicy: "eligible",
          analyticsDisposition: "include",
        },
      },
    },
  ],
};

/** Same immutable policy expressed as a pure function for reasoning/tests. */
export function isCorrectiveReasonCandidate(
  snapshot: {
    nature: string;
    maintenanceKpiPolicy: string;
    analyticsDisposition: string;
  } | null | undefined,
): boolean {
  // Legacy data must be judged by the original BI evidence and policy.
  if (snapshot == null) return true;
  return snapshot.nature === "corrective_failure" &&
    snapshot.maintenanceKpiPolicy === "eligible" &&
    snapshot.analyticsDisposition === "include";
}
