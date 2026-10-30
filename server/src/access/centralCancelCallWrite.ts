import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { resolveSession, lockUser } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission, type Principal } from "./policy.js";

/** Central cancellation is allowed for the verified call creator OR an
 * explicit cancel.any privilege, not by any browser-supplied cancelledBy.
 * Shared legacy domain performs physical-stop handoff and cancellation.
 */
export function runCentralCancelCall<T extends { id: string; status: string }>(
  db: Pick<PrismaClient, "$transaction">,
  input: { token: string; workstationId: string; callId: string; reason: unknown;
    requestId?: string; ipAddress?: string },
  apply: (tx: Prisma.TransactionClient, actor: Principal, reason: string) => Promise<T | null>,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (typeof input.reason !== "string" ||
      !input.reason.trim() || input.reason.trim().length > 2000)
    throw new AccessError("cancellation_reason_required", 400);
  const reason = input.reason.trim();
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
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");

    const ref = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true },
    });
    if (!ref) throw new AccessError("call_not_found", 404);
    if (principal.machineScope !== "all" &&
        !principal.machineIds.includes(ref.machineId))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, ref.machineId);
    const latest = await resolveSession(tx, request);
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, status: true, createdBy: true,
        isSystemTest: true, attendedAt: true, currentAttendanceStartedAt: true },
    });
    if (!call || call.machineId !== ref.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.status !== "open" || call.attendedAt || call.currentAttendanceStartedAt)
      throw new AccessError("call_state_changed", 409);
    const canCancelAny = latest.isPrimaryAdmin ||
      latest.permissions.includes("calls.cancel.any");
    if (canCancelAny) {
      assertPermission(latest, "calls.cancel.any", ref.machineId);
    } else {
      assertPermission(latest, "calls.cancel.own", ref.machineId);
      if (call.createdBy !== latest.login)
        throw new AccessError("permission_denied");
    }
    const result = await apply(tx, latest, reason);
    if (!result || result.id !== input.callId || result.status !== "cancelled")
      throw new AccessError("call_state_changed", 409);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: "calls.cancel", resourceType: "andon_call",
      resourceId: input.callId, machineId: ref.machineId,
      reason,
      before: { status: "open", createdBy: call.createdBy },
      after: { status: "cancelled", cancelledBy: latest.login },
    });
    return result;
  });
}
