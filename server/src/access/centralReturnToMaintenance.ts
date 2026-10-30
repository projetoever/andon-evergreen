import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { applyReturnToMaintenanceDomainTransition } from "../routes/andonCalls.js";

/**
 * Central return from follow-up to maintenance. Shared legacy business domain
 * preserves remaining technicians, maintenance cycle and time accounting.
 * Lock and authorization sequence remains user -> workstation -> machine -> technicians.
 */
export function runCentralReturnToMaintenance(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string; reason?: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (input.reason !== undefined &&
      (typeof input.reason !== "string" || input.reason.length > 2000))
    throw new AccessError("invalid_input", 400);
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
    assertPermission(principal, "calls.returnToMaintenance");

    const reference = await tx.andonCall.findUnique({
      where: { id: input.callId }, select: { machineId: true },
    });
    if (!reference) throw new AccessError("call_not_found", 404);
    if (principal.machineScope !== "all" &&
        !principal.machineIds.includes(reference.machineId))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, reference.machineId);
    const latest = await resolveSession(tx, request);
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    const updatedStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!updatedStation?.active || updatedStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, updatedStation, "operational");
    assertPermission(latest, "calls.returnToMaintenance", reference.machineId);
    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, category: true, status: true, isSystemTest: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.category !== "maintenance" || call.status !== "post_maintenance")
      throw new AccessError("call_state_changed", 409);
    const result = await applyReturnToMaintenanceDomainTransition(tx, {
      callId: input.callId, reason: input.reason,
    });
    if (!result) throw new AccessError("call_state_changed", 409);

    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "calls.returnToMaintenance",
      resourceType: "andon_call", resourceId: input.callId,
      machineId: reference.machineId,
      before: { status: "post_maintenance" },
      after: { status: "in_progress",
        maintenanceReturnCount: result.maintenanceReturnCount },
    });
    return result;
  });
}
