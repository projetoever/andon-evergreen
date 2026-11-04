import { DISPOSITIONS, RESPONSIBILITIES } from "../analytics/eligibility.js";

/**
 * REFINE 6 phase 1: catalog-only policy. Nothing here activates new buttons,
 * opens calls, backfills old calls, or changes the BI calculation.
 *
 * A reason (Setup) and a technical area (Mecânica) have different identities.
 * "eligible" is ONLY a candidate for corrective KPIs after measured physical
 * evidence and confirmed maintenance responsibility.
 */
export const CALL_REASON_NATURES = [
  "corrective_failure", "planned_setup", "production_support", "unclassified",
] as const;
export const MAINTENANCE_KPI_POLICIES = ["eligible", "excluded", "pending"] as const;

export type CallReasonNature = (typeof CALL_REASON_NATURES)[number];
export type MaintenanceKpiPolicy = (typeof MAINTENANCE_KPI_POLICIES)[number];
export type SuggestedResponsibility = (typeof RESPONSIBILITIES)[number];
export type ReasonDisposition = (typeof DISPOSITIONS)[number];

export type ReasonPolicy = {
  nature: string;
  suggestedResponsibility: string;
  maintenanceKpiPolicy: string;
  analyticsDisposition: string;
};

export type ReasonRecord = ReasonPolicy & {
  id: string;
  displayName: string;
  active: boolean;
  revision: number;
};

export type ReasonOptionRecord = {
  id: string;
  reasonId: string;
  technicalAreaId: string;
  displayName: string | null;
  active: boolean;
  revision: number;
  natureOverride: string | null;
  suggestedResponsibilityOverride: string | null;
  maintenanceKpiPolicyOverride: string | null;
  analyticsDispositionOverride: string | null;
};

export type TechnicalAreaRecord = {
  id: string;
  displayName: string;
  categoryGroup: string;
  active: boolean;
};

export class ReasonPolicyError extends Error {
  constructor(public readonly code: string) { super(code); }
}

const includes = (values: readonly string[], value: string): boolean => values.includes(value);
const isValidPolicy = (policy: ReasonPolicy): boolean =>
  includes(CALL_REASON_NATURES, policy.nature) &&
  includes(RESPONSIBILITIES, policy.suggestedResponsibility) &&
  includes(MAINTENANCE_KPI_POLICIES, policy.maintenanceKpiPolicy) &&
  includes(DISPOSITIONS, policy.analyticsDisposition) &&
  (policy.nature === "corrective_failure" || policy.maintenanceKpiPolicy !== "eligible");

export function validateReasonPolicy(policy: ReasonPolicy) {
  if (!isValidPolicy(policy)) throw new ReasonPolicyError("invalid_reason_kpi_policy");
  return policy;
}

export function resolveReasonOption(
  reason: ReasonRecord,
  option: ReasonOptionRecord,
  technicalArea: TechnicalAreaRecord,
) {
  if (!reason.active || !option.active || !technicalArea.active)
    throw new ReasonPolicyError("reason_option_inactive");
  if (!Number.isSafeInteger(reason.revision) || reason.revision < 1 ||
      !Number.isSafeInteger(option.revision) || option.revision < 1)
    throw new ReasonPolicyError("reason_revision_invalid");
  if (option.reasonId !== reason.id || option.technicalAreaId !== technicalArea.id)
    throw new ReasonPolicyError("reason_option_relation_mismatch");
  if (!["maintenance", "production"].includes(technicalArea.categoryGroup))
    throw new ReasonPolicyError("technical_area_group_invalid");

  const policy = validateReasonPolicy({
    nature: option.natureOverride ?? reason.nature,
    suggestedResponsibility: option.suggestedResponsibilityOverride ?? reason.suggestedResponsibility,
    maintenanceKpiPolicy: option.maintenanceKpiPolicyOverride ?? reason.maintenanceKpiPolicy,
    analyticsDisposition: option.analyticsDispositionOverride ?? reason.analyticsDisposition,
  });
  if (policy.nature === "corrective_failure" && technicalArea.categoryGroup !== "maintenance")
    throw new ReasonPolicyError("corrective_reason_requires_maintenance_area");

  const correctiveCandidate =
    policy.nature === "corrective_failure" &&
    policy.maintenanceKpiPolicy === "eligible" &&
    policy.analyticsDisposition === "include";
  const effectiveKpiStatus = policy.analyticsDisposition !== "include"
    ? "excluded"
    : policy.maintenanceKpiPolicy;

  return {
    reasonId: reason.id,
    reasonNameSnapshot: reason.displayName,
    reasonRevision: reason.revision,
    optionId: option.id,
    optionNameSnapshot: option.displayName ?? technicalArea.displayName,
    optionRevision: option.revision,
    technicalAreaId: technicalArea.id,
    categoryGroup: technicalArea.categoryGroup,
    nature: policy.nature as CallReasonNature,
    suggestedResponsibility: policy.suggestedResponsibility as SuggestedResponsibility,
    maintenanceKpiPolicy: policy.maintenanceKpiPolicy as MaintenanceKpiPolicy,
    analyticsDisposition: policy.analyticsDisposition as ReasonDisposition,
    effectiveKpiStatus,
    correctiveCandidate,
    // Independent domains: legitimate setup is still a real call, and both
    // technical person-time and independently confirmed physical stop remain.
    isValidOperationalCall: policy.analyticsDisposition === "include",
    preservesIndependentPhysicalDowntime: true,
    technicalTimeRecordedSeparately: true,
  } as const;
}

/** Pure, conservative gate. Do not call this with suggestions as evidence. */
export function confirmedCorrectiveKpiContribution(
  policy: ReturnType<typeof resolveReasonOption>,
  evidence: {
    confirmedResponsibility: string;
    verifiedPhysicalEpisode: boolean;
    entirelyCorrectiveEpisode: boolean;
    isSystemTest: boolean;
  },
): boolean {
  return policy.correctiveCandidate &&
    evidence.confirmedResponsibility === "maintenance" &&
    evidence.verifiedPhysicalEpisode &&
    evidence.entirelyCorrectiveEpisode &&
    !evidence.isSystemTest;
}
