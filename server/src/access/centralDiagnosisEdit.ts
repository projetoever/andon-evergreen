import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { identifyTechnician } from "../services/technicianIdentity.js";
import { normalizePin } from "../security/technicianCredentials.js";
import { applyFailureDiagnosisDomainTransition } from "../routes/andonCalls.js";

/**
 * SEC-04/2N: a central principal needs both history.read and diagnosis.edit.
 * An independently verified technician PIN signs the detailed diagnosis log.
 * Lock order: user -> workstation -> machine -> technician -> call row.
 * The shared domain + technician audit + central principal audit are atomic.
 */
export function runCentralDiagnosisEdit(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    classification: string; description: string; pin: string;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (!input.classification || input.classification.length > 160 ||
      !input.description || input.description.length > 4000 ||
      !normalizePin(input.pin))
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
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertPermission(principal, "history.read");
    assertPermission(principal, "diagnosis.edit");

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
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertPermission(latest, "history.read", reference.machineId);
    assertPermission(latest, "diagnosis.edit", reference.machineId);

    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, status: true, isSystemTest: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.status !== "finished") throw new AccessError("call_state_changed", 409);

    const original = await identifyTechnician({ method: "pin", value: input.pin }, tx);
    if (!original) throw new AccessError("invalid_technician_pin", 401);
    await lockTechnicianSessionFlow(tx, original.id);
    const technician = await identifyTechnician({ method: "pin", value: input.pin }, tx);
    if (!technician || technician.id !== original.id)
      throw new AccessError("invalid_technician_pin", 401);

    const result = await applyFailureDiagnosisDomainTransition(tx, {
      callId: input.callId,
      classification: input.classification,
      description: input.description,
      technician: { id: technician.id, name: technician.name },
      workstationId: input.workstationId, ipAddress: input.ipAddress,
    });
    if ("error" in result && result.error)
      throw new AccessError(
        result.status === 404 ? "call_not_found" : "diagnosis_invalid",
        result.status,
      );
    if (!("call" in result) || !result.call)
      throw new AccessError("call_state_changed", 409);

    if (result.changed) {
      await appendAudit(tx, {
        ...actorFromPrincipal(latest),
        ipAddress: input.ipAddress, requestId: input.requestId,
      }, {
        action: "diagnosis.edit", resourceType: "andon_call",
        resourceId: input.callId, machineId: reference.machineId,
        before: {
          classification: result.previousClassification,
          responsibility: result.previousResponsibility,
        },
        after: {
          classification: result.currentClassification,
          responsibility: result.currentResponsibility,
          technicianId: technician.id,
        },
      });
    }
    return result.call;
  });
}
