import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { resolveSession, lockUser } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { applyMaintenanceCompletionDomainTransition } from "../routes/andonCalls.js";

/**
 * Central completion of physical maintenance, NOT the final closure of a call.
 * No generic write opt-in; caller is the reviewed HTTP route only.
 * Lock order: user -> workstation -> machine -> technicians; domain reuses
 * the original workstation-ownership rule and attendance/follow-up counters.
 */
export function runCentralMaintenanceCompletion(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    notes?: unknown; followUpSessionIds?: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (input.notes !== undefined &&
      (typeof input.notes !== "string" || input.notes.length > 4000))
    throw new AccessError("invalid_input", 400);
  if (input.followUpSessionIds !== undefined &&
      (!Array.isArray(input.followUpSessionIds) ||
        input.followUpSessionIds.length > 6 ||
        input.followUpSessionIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 160) ||
        new Set(input.followUpSessionIds).size !== input.followUpSessionIds.length))
    throw new AccessError("invalid_input", 400);

  return db.$transaction(async (tx) => {
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
    const workstation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { id: true, active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!workstation?.active || workstation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, workstation, "operational");
    assertPermission(principal, "calls.finishMaintenance");

    // Resolve machine ownership from the call row, NEVER from request body.
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
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    const currentStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!currentStation?.active || currentStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, currentStation, "operational");
    assertPermission(latest, "calls.finishMaintenance", reference.machineId);
    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, category: true, status: true, isSystemTest: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.category !== "maintenance" || call.status !== "in_progress")
      throw new AccessError("call_state_changed", 409);

    // Shared legacy domain controls current workstation, technician locks,
    // session transitions, follow-up allocation and stop-state accounting.
    const result = await applyMaintenanceCompletionDomainTransition(tx, {
      callId: input.callId, workstationId: input.workstationId,
      notes: input.notes, followUpSessionIds: input.followUpSessionIds,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "calls.finishMaintenance", resourceType: "andon_call",
      resourceId: input.callId, machineId: reference.machineId,
      before: { status: call.status },
      after: {
        status: "post_maintenance",
        continuedTechnicianSessions: input.followUpSessionIds === undefined
          ? "all_active" : input.followUpSessionIds.length,
      },
    });
    return result;
  });
}
