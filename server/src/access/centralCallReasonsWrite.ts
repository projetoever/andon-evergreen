import type { Prisma, PrismaClient, CallReason, CallReasonOption } from "@prisma/client";
import { AccessError, isAndonSettingsDelegate } from "./policy.js";
import { runCentralGlobalCatalogTransaction } from "./centralGlobalCatalogTransaction.js";
import {
  parseReasonCreate, parseReasonPatch, parseOptionCreate,
  parseOptionPatch, assertEffectiveReasonOption,
} from "../services/callReasonMutations.js";
import { centralCallReasonsHttpEnabled } from "../security/centralCallReasonsHttp.js";
import { isReasonPresentationOnlyPatch } from "../security/callReasonPresentationPolicy.js";

export type CallReasonWrite = {
  token: string;
  workstationId: string;
  operation: "reason.create" | "reason.update" | "option.create" | "option.update";
  reasonId?: string;
  optionId?: string;
  body: unknown;
  requestId?: string;
  ipAddress?: string;
};
const ID = /^[a-z0-9_]{2,40}$/;

/**
 * No implicit rollout: this adapter is inert unless the central and reason
 * feature flags are BOTH ON. All writes repeat grant checks under user and
 * workstation locks and perform mutation + audit in ONE DB transaction.
 */
export function runCentralCallReasonWrite(
  db: Pick<PrismaClient, "$transaction">,
  input: CallReasonWrite,
) {
  if (!centralCallReasonsHttpEnabled()) throw new AccessError("central_action_not_supported");
  if (input.operation === "reason.create" && (input.reasonId || input.optionId))
    throw new AccessError("invalid_action_resource", 400);
  if (input.operation === "reason.update" && (input.optionId || !ID.test(input.reasonId ?? "")))
    throw new AccessError("invalid_action_resource", 400);
  if (input.operation === "option.create" && (input.optionId || !ID.test(input.reasonId ?? "")))
    throw new AccessError("invalid_action_resource", 400);
  if (input.operation === "option.update" &&
      (!ID.test(input.reasonId ?? "") || !ID.test(input.optionId ?? "")))
    throw new AccessError("invalid_action_resource", 400);

  const { reasonId, optionId } = input;
  const route = input.operation === "reason.create"
    ? "/api/call-reasons"
    : input.operation === "reason.update"
      ? `/api/call-reasons/${reasonId}`
      : input.operation === "option.create"
        ? `/api/call-reasons/${reasonId}/options`
        : `/api/call-reasons/${reasonId}/options/${optionId}`;
  const presentationPatch = isReasonPresentationOnlyPatch(input.operation, input.body);
  return runCentralGlobalCatalogTransaction<CallReason | CallReasonOption>(db, {
    token: input.token,
    workstationId: input.workstationId,
    method: input.operation.endsWith("create") ? "POST" : "PATCH",
    path: route,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    requirePrimaryAdmin: !presentationPatch,
    additionalPermissions: presentationPatch ? [] : ["analytics.policy.manage"],
    // A stale or changed identity cannot convert this into a write grant.
    // The locked transaction checks both the first and refreshed principals.
    assertAuthorizedCatalogPrincipal: (principal) => {
      if (presentationPatch && !principal.isPrimaryAdmin &&
          !isAndonSettingsDelegate(principal))
        throw new AccessError("primary_admin_required");
    },
    applyReviewedDomainMutation: async (tx: Prisma.TransactionClient) => {
      if (input.operation === "reason.create") {
        const data = parseReasonCreate(input.body);
        const created = await tx.callReason.create({ data });
        return {
          value: created, resourceType: "call_reason", resourceId: created.id,
          after: created,
        };
      }
      if (input.operation === "reason.update") {
        const current = await tx.callReason.findUnique({
          where: { id: reasonId! },
          include: { options: { include: { technicalArea: true } } },
        });
        if (!current) throw new AccessError("call_reason_not_found", 404);
        const data = parseReasonPatch(input.body, current);
        // Updating a parent may not silently make an existing option eligible
        // for corrective KPIs or change its target specialty.
        for (const option of current.options) {
          assertEffectiveReasonOption({ ...current, ...data }, option, option.technicalArea);
        }
        const updated = await tx.callReason.update({
          where: { id: current.id },
          data: { ...data, revision: { increment: 1 } },
        });
        const { options: _options, ...before } = current;
        return {
          value: updated, resourceType: "call_reason", resourceId: updated.id,
          before, after: updated,
        };
      }
      if (input.operation === "option.create") {
        const data = parseOptionCreate(input.body);
        const [reason, area] = await Promise.all([
          tx.callReason.findUnique({ where: { id: reasonId! } }),
          tx.andonCategory.findUnique({ where: { id: data.technicalAreaId } }),
        ]);
        if (!reason) throw new AccessError("call_reason_not_found", 404);
        if (!area) throw new AccessError("technical_area_not_found", 404);
        if (data.active && !area.active) throw new AccessError("technical_area_inactive", 409);
        assertEffectiveReasonOption(reason, { ...data, reasonId: reason.id, revision: 1 }, area);
        const created = await tx.callReasonOption.create({
          data: { ...data, reasonId: reason.id },
        });
        return {
          value: created, resourceType: "call_reason_option", resourceId: created.id,
          after: created,
        };
      }
      const current = await tx.callReasonOption.findUnique({
        where: { id: optionId! },
        include: { reason: true, technicalArea: true },
      });
      if (!current || current.reasonId !== reasonId)
        throw new AccessError("call_reason_option_not_found", 404);
      const data = parseOptionPatch(input.body, current);
      if (data.active && !current.technicalArea.active)
        throw new AccessError("technical_area_inactive", 409);
      assertEffectiveReasonOption(current.reason, { ...current, ...data }, current.technicalArea);
      const updated = await tx.callReasonOption.update({
        where: { id: current.id },
        data: { ...data, revision: { increment: 1 } },
      });
      const { reason: _reason, technicalArea: _area, ...before } = current;
      return {
        value: updated, resourceType: "call_reason_option", resourceId: updated.id,
        before, after: updated,
      };
    },
  });
}
