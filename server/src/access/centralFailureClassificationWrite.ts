import type { Prisma, PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { runCentralGlobalCatalogTransaction } from "./centralGlobalCatalogTransaction.js";
import {
  validateCentralClassificationCreate, validateCentralClassificationUpdate,
  type ClassificationMutation,
} from "./centralClassificationDomain.js";

/**
 * Preparatory server-only adapter for POST/PATCH failure classifications.
 * Never pass this function or its callback to an HTTP handler without a
 * separate review of the central-write activation plan and legacy parity.
 * In central mode all HTTP mutations continue to fail closed.
 */
export function runCentralFailureClassificationWrite(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string;
    operation: "create" | "update";
    classificationId?: string;
    body: ClassificationMutation;
    requestId?: string; ipAddress?: string;
  },
) {
  const id = input.classificationId;
  if (input.operation === "update" && (!id || !/^[A-Za-z0-9_-]{1,160}$/.test(id)))
    throw new AccessError("invalid_action_resource", 400);
  if (input.operation === "create" && id !== undefined)
    throw new AccessError("invalid_action_resource", 400);
  const method = input.operation === "create" ? "POST" : "PATCH";
  const path = input.operation === "create"
    ? "/api/failure-classifications"
    : `/api/failure-classifications/${id}`;
  return runCentralGlobalCatalogTransaction(db, {
    token: input.token, workstationId: input.workstationId,
    method, path, requestId: input.requestId, ipAddress: input.ipAddress,
    applyReviewedDomainMutation: async (tx: Prisma.TransactionClient) => {
      if (input.operation === "create") {
        const data = validateCentralClassificationCreate(input.body);
        const created = await tx.failureClassification.create({ data });
        return {
          value: created, resourceType: "failure_classification", resourceId: created.id,
          after: created,
        };
      }
      // Global advisory lock is already acquired by the enclosing guard.
      // Never trust a client-supplied "current" value for reserved exclusions.
      const current = await tx.failureClassification.findUnique({
        where: { id: id! },
      });
      if (!current) throw new AccessError("classification_not_found", 404);
      const data = validateCentralClassificationUpdate(current, input.body);
      const updated = await tx.failureClassification.update({
        where: { id: current.id }, data,
      });
      return {
        value: updated, resourceType: "failure_classification", resourceId: updated.id,
        before: current, after: updated,
      };
    },
  });
}
