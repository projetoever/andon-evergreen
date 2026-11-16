import { AccessError } from "../access/policy.js";
import type { ReasonOpeningSelection } from "./callReasonOpening.js";

/**
 * REFINE 22.2: validate group batch metadata without trusting any BI/KPI fields.
 * Actual group, option, area and revisions are re-checked with row locks in
 * resolveOpeningReasonInTransaction before any call is inserted.
 */
export type GroupBatchSelection = {
  subtype: string;
  selection: ReasonOpeningSelection;
};

const ID = /^[a-z0-9_]{2,40}$/;
const REQUIRED = ["reasonId", "optionId", "expectedReasonRevision", "expectedOptionRevision", "subtype"] as const;

export function parseGroupBatchSelections(value: unknown, subtypes: string[]): GroupBatchSelection[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20 ||
      value.length !== subtypes.length || new Set(subtypes).size !== subtypes.length) {
    throw new AccessError("invalid_group_batch_selection", 400);
  }
  let expectedReasonId: string | null = null;
  const rows = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AccessError("invalid_group_batch_selection", 400);
    }
    const row = entry as Record<string, unknown>;
    if (Object.keys(row).length !== REQUIRED.length ||
        Object.keys(row).some(key => !REQUIRED.includes(key as typeof REQUIRED[number])) ||
        !REQUIRED.every(key => Object.prototype.hasOwnProperty.call(row, key)) ||
        typeof row.reasonId !== "string" || !ID.test(row.reasonId) ||
        typeof row.optionId !== "string" || !ID.test(row.optionId) ||
        typeof row.subtype !== "string" || !ID.test(row.subtype) ||
        row.subtype !== subtypes[index] ||
        !Number.isSafeInteger(row.expectedReasonRevision) ||
        (row.expectedReasonRevision as number) < 1 ||
        !Number.isSafeInteger(row.expectedOptionRevision) ||
        (row.expectedOptionRevision as number) < 1) {
      throw new AccessError("invalid_group_batch_selection", 400);
    }
    if (expectedReasonId !== null && row.reasonId !== expectedReasonId) {
      throw new AccessError("mixed_group_batch_not_allowed", 400);
    }
    expectedReasonId = row.reasonId;
    return {
      subtype: row.subtype,
      selection: {
        reasonId: row.reasonId, optionId: row.optionId,
        expectedReasonRevision: row.expectedReasonRevision,
        expectedOptionRevision: row.expectedOptionRevision,
      },
    };
  });
  if (new Set(rows.map(item => item.selection.optionId)).size !== rows.length) {
    throw new AccessError("invalid_group_batch_selection", 400);
  }
  return rows;
}
