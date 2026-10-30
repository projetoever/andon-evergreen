import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { resolveSession, lockUser } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { identifyTechnician } from "../services/technicianIdentity.js";
import { normalizeCredential } from "../security/technicianCredentials.js";
import { endActiveTechnicianSession } from "../routes/andonCalls.js";

/**
 * SEC-04/2L — authenticated and audited individual technician exit.
 * The credential identifies the technician. Browser-supplied names or IDs
 * are not accepted. The shared domain preserves the last-maintainer guard.
 *
 * Lock order: user -> workstation -> machine -> technician.
 * All verification, session termination and audit share one transaction.
 */
export function runCentralTechnicianEnd(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    credential: { method?: unknown; value?: unknown } | undefined;
    reason?: unknown; notes?: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  const credential = normalizeCredential(input.credential?.method, input.credential?.value);
  if (!credential) throw new AccessError("technician_credential_required", 400);
  if ((input.reason !== undefined &&
       (typeof input.reason !== "string" || input.reason.length > 2000)) ||
      (input.notes !== undefined &&
       (typeof input.notes !== "string" || input.notes.length > 4000)))
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
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertPermission(principal, "calls.technicians.manage");

    const reference = await tx.andonCall.findUnique({
      where: { id: input.callId }, select: { machineId: true },
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
    assertPermission(latest, "calls.technicians.manage", reference.machineId);

    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, status: true, category: true, isSystemTest: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.category !== "maintenance" ||
        (call.status !== "in_progress" && call.status !== "post_maintenance"))
      throw new AccessError("call_state_changed", 409);

    // Credential verification and administrative technician changes use the
    // same advisory lock: reject deactivation/credential rotation in a race.
    const initial = await identifyTechnician(credential, tx);
    if (!initial) throw new AccessError("technician_credential_invalid", 403);
    await lockTechnicianSessionFlow(tx, initial.id);
    const identified = await identifyTechnician(credential, tx);
    if (!identified || identified.id !== initial.id)
      throw new AccessError("technician_credential_invalid", 403);

    const result = await endActiveTechnicianSession(tx, {
      callId: input.callId, technicianId: identified.id,
      reason: typeof input.reason === "string" ? input.reason.trim() || undefined : undefined,
      notes: typeof input.notes === "string" ? input.notes.trim() || undefined : undefined,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "calls.technicians.end", resourceType: "andon_call",
      resourceId: input.callId, machineId: reference.machineId,
      after: { technicianId: identified.id, status: call.status },
    });
    return result;
  });
}
