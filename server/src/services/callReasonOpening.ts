import { Prisma } from "@prisma/client";
import { AccessError } from "../access/policy.js";
import { resolveReasonOption, ReasonPolicyError } from "./callReasons.js";

/**
 * S3-B2: fail-closed *building block* for the future central call-open
 * transaction. The caller MUST authenticate and authorize calls.open,
 * lock the machine, validate OS, and insert both the call and this snapshot
 * in that SAME transaction. Do not expose this helper as a new HTTP route.
 */
export type ReasonOpeningSelection = {
  reasonId: unknown;
  optionId: unknown;
  expectedReasonRevision: unknown;
  expectedOptionRevision: unknown;
};

type ReasonOpeningInput = {
  selection: ReasonOpeningSelection;
  legacyCategory: unknown;
  legacySubtype: unknown;
  /** Server configuration, never read from request JSON. */
  catalogEnabled: boolean;
  hierarchicalOpeningEnabled: boolean;
};

const IDENTIFIER = /^[a-z0-9_]{2,40}$/;
function parseIdentifier(value: unknown): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new AccessError("invalid_call_reason_selection", 400);
  }
  return value;
}
function parseRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new AccessError("invalid_call_reason_revision", 400);
  }
  return value as number;
}

export function parseReasonOpeningSelection(input: ReasonOpeningInput) {
  if (!input.catalogEnabled || !input.hierarchicalOpeningEnabled) {
    throw new AccessError("hierarchical_calls_disabled", 403);
  }
  const reasonId = parseIdentifier(input.selection.reasonId);
  const optionId = parseIdentifier(input.selection.optionId);
  const legacySubtype = parseIdentifier(input.legacySubtype);
  if (input.legacyCategory !== "maintenance" && input.legacyCategory !== "production") {
    throw new AccessError("invalid_call_category", 400);
  }
  return {
    reasonId,
    optionId,
    expectedReasonRevision: parseRevision(input.selection.expectedReasonRevision),
    expectedOptionRevision: parseRevision(input.selection.expectedOptionRevision),
    legacyCategory: input.legacyCategory,
    legacySubtype,
  };
}

/**
 * Call this AFTER existing session/workstation/machine locks and BEFORE
 * tx.andonCall.create, so the verified snapshot is inserted with the call.
 * FOR SHARE guards catalog rows against concurrent rename/deactivation
 * until the parent transaction commits; updates acquire conflicting row locks.
 */
export async function resolveOpeningReasonInTransaction(
  tx: Prisma.TransactionClient,
  input: ReasonOpeningInput,
) {
  const selected = parseReasonOpeningSelection(input);

  // Consistent lock order: reason -> option -> area, with no user input in SQL.
  const lockedReason = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "call_reasons" WHERE "id" = ${selected.reasonId} FOR SHARE`,
  );
  if (lockedReason.length !== 1) throw new AccessError("call_reason_not_found", 409);
  const lockedOption = await tx.$queryRaw<Array<{ id: string; technicalAreaId: string }>>(
    Prisma.sql`SELECT "id", "technicalAreaId" FROM "call_reason_options"
      WHERE "id" = ${selected.optionId} AND "reasonId" = ${selected.reasonId} FOR SHARE`,
  );
  if (lockedOption.length !== 1) throw new AccessError("call_reason_option_not_found", 409);
  const lockedArea = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "andon_categories" WHERE "id" = ${lockedOption[0].technicalAreaId} FOR SHARE`,
  );
  if (lockedArea.length !== 1) throw new AccessError("call_reason_area_not_found", 409);

  const option = await tx.callReasonOption.findUnique({
    where: { id: selected.optionId },
    include: { reason: true, technicalArea: true },
  });
  if (!option || option.reasonId !== selected.reasonId ||
      option.technicalAreaId !== selected.legacySubtype ||
      option.technicalArea.categoryGroup !== selected.legacyCategory) {
    throw new AccessError("call_reason_category_mismatch", 409);
  }
  if (option.reason.revision !== selected.expectedReasonRevision ||
      option.revision !== selected.expectedOptionRevision) {
    throw new AccessError("call_reason_revision_conflict", 409);
  }
  try {
    const resolved = resolveReasonOption(option.reason, option, option.technicalArea);
    // A snapshot is evidence, not permission to count a corrective KPI.
    return {
      reasonId: resolved.reasonId,
      reasonNameSnapshot: resolved.reasonNameSnapshot,
      reasonRevision: resolved.reasonRevision,
      optionId: resolved.optionId,
      optionNameSnapshot: resolved.optionNameSnapshot,
      optionRevision: resolved.optionRevision,
      technicalAreaId: resolved.technicalAreaId,
      nature: resolved.nature,
      suggestedResponsibility: resolved.suggestedResponsibility,
      maintenanceKpiPolicy: resolved.maintenanceKpiPolicy,
      analyticsDisposition: resolved.analyticsDisposition,
    };
  } catch (error) {
    if (error instanceof ReasonPolicyError)
      throw new AccessError(error.code, 409);
    throw error;
  }
}
