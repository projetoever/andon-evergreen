import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";

type FinishedCall = {
  id: string; status: string; failureClassification?: string | null;
  machineStoppedMinutes?: number | null; machineStatusAtFinish?: string | null;
};

/** Shared finalization domain executes inside this verified, audited transaction.
 * It owns diagnosis, assets, technician times and physical-stop handoff.
 */
export function runCentralFinishCall<T extends FinishedCall>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    body: Record<string, unknown>; requestId?: string; ipAddress?: string;
  },
  apply: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (Object.keys(input.body).some(key => ![
    "notes", "failureClassification", "failureDescription", "machineStatus",
    "impactCallIds", "confirmedMachineSetId", "confirmedMachineSubsetId",
    "assetChangeReason",
  ].includes(key)))
    throw new AccessError("invalid_input", 400);
  const impactIds = input.body.impactCallIds;
  if (impactIds !== undefined &&
      (!Array.isArray(impactIds) || impactIds.length > 20 ||
        impactIds.some(id => typeof id !== "string" || !id.trim() || id.length > 160) ||
        new Set(impactIds).size !== impactIds.length))
    throw new AccessError("invalid_impact_calls", 400);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const req = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, req);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { id: true, active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertPermission(principal, "calls.finish");

    // This machine ID comes only from the call record, never the browser.
    const reference = await tx.andonCall.findUnique({
      where: { id: input.callId }, select: { machineId: true },
    });
    if (!reference) throw new AccessError("call_not_found", 404);
    if (principal.machineScope !== "all" &&
        !principal.machineIds.includes(reference.machineId))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, reference.machineId);
    const latest = await resolveSession(tx, req);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertPermission(latest, "calls.finish", reference.machineId);

    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, category: true, status: true, isSystemTest: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.status === "finished" || call.status === "cancelled")
      throw new AccessError("call_state_changed", 409);
    if ((call.category === "maintenance" && call.status !== "post_maintenance") ||
        (call.category === "production" && call.status !== "in_progress"))
      throw new AccessError("call_state_changed", 409);

    // Stop ownership may be handed to other calls only within THIS machine.
    if (Array.isArray(impactIds) && impactIds.length) {
      const belonging = await tx.andonCall.count({
        where: { id: { in: impactIds }, machineId: reference.machineId },
      });
      if (belonging !== impactIds.length)
        throw new AccessError("invalid_impact_calls", 400);
    }
    const result = await apply(tx);
    if (!result || result.id !== input.callId || result.status !== "finished")
      throw new AccessError("call_state_changed", 409);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: "calls.finish", resourceType: "andon_call",
      resourceId: input.callId, machineId: reference.machineId,
      before: { status: call.status },
      after: {
        status: "finished",
        failureClassification: result.failureClassification,
        machineStoppedMinutes: result.machineStoppedMinutes,
        machineStatusAtFinish: result.machineStatusAtFinish,
      },
    });
    return result;
  });
}
