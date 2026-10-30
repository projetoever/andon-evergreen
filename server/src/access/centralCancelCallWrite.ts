import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission, type Principal } from "./policy.js";

/** Cancel is distinct from completion: only an unopened, never-attended call
 * may be cancelled and "own" means the server-stored creator matches login.
 */
export function runCentralCancelCall<T extends { id: string; status: string }>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string; reason: string;
    requestId?: string; ipAddress?: string;
  },
  apply: (tx: Prisma.TransactionClient, principal: Principal) => Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (typeof input.reason !== "string" || !input.reason.trim() ||
      input.reason.trim().length > 1500)
    throw new AccessError("invalid_cancel_reason", 400);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
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

    const reference = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true },
    });
    if (!reference) throw new AccessError("call_not_found", 404);
    if (principal.machineScope !== "all" &&
        !principal.machineIds.includes(reference.machineId))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, reference.machineId);
    const latest = await resolveSession(tx, request);
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
    const current = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: {
        id: true, machineId: true, createdBy: true, status: true,
        isSystemTest: true, attendedAt: true,
      },
    });
    if (!current || current.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (current.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (current.status !== "open" || current.attendedAt)
      throw new AccessError("call_state_changed", 409);

    const any = latest.isPrimaryAdmin || latest.permissions.includes("calls.cancel.any");
    if (any) assertPermission(latest, "calls.cancel.any", reference.machineId);
    else {
      assertPermission(latest, "calls.cancel.own", reference.machineId);
      if (!current.createdBy || current.createdBy !== latest.login)
        throw new AccessError("permission_denied");
    }
    const cancelled = await apply(tx, latest);
    if (!cancelled || cancelled.id !== input.callId || cancelled.status !== "cancelled")
      throw new AccessError("call_state_changed", 409);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: any ? "calls.cancel.any" : "calls.cancel.own",
      resourceType: "andon_call", resourceId: input.callId,
      machineId: reference.machineId, before: { status: current.status },
      after: { status: "cancelled", reason: input.reason.trim(),
        cancelledBy: latest.login },
    });
    return cancelled;
  });
}
