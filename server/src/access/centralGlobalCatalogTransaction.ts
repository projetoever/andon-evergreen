import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError } from "./policy.js";
import { preflightCentralGlobalCatalogWrite } from "./centralGlobalCatalogPreflight.js";

/**
 * SEC-04/2B.3: isolated transaction prototype; not attached to HTTP handlers.
 * Integration requires a reviewed domain adapter (referential validation,
 * historical integrity, affected-object snapshots and server-only action).
 * The central HTTP middleware still denies every write.
 */
export async function runCentralGlobalCatalogTransaction<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string;
    method: string; path: string;
    requestId?: string; ipAddress?: string;
    // Must be supplied only by trusted server code, never from a request body.
    applyReviewedDomainMutation: (tx: Prisma.TransactionClient) => Promise<{
      value: T; resourceId: string; resourceType: string;
      before?: unknown; after?: unknown;
    }>;
  },
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !input.method || !input.path)
    throw new AccessError("invalid_action_resource", 400);

  return db.$transaction(async (tx) => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    // Serialize global catalog modifications across all categories and types.
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(andon-global-catalog))::text
    `);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const workstation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { id: true, active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!workstation) throw new AccessError("workstation_inactive");
    const action = preflightCentralGlobalCatalogWrite({
      principal, workstation, request: { method: input.method, path: input.path },
    });
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    preflightCentralGlobalCatalogWrite({
      principal: latest, workstation, request: { method: input.method, path: input.path },
    });
    const result = await input.applyReviewedDomainMutation(tx);
    if (!result || !result.resourceId || !result.resourceType)
      throw new AccessError("invalid_action_resource", 400);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: action.permission,
      resourceType: result.resourceType, resourceId: result.resourceId,
      before: result.before, after: result.after,
    });
    return result.value;
  });
}
