import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { getTechnicianTechnicalAreas } from "../services/technicianIdentity.js";
import { parseDeclaredTechnicianNames, resolveActiveNames } from "./centralDeclaredNameVerification.js";
import { lockAndFindMissingActiveTechnicians, persistAddedTechnicianSessions } from "../routes/andonCalls.js";
import { centralDeclaredNameTechnicianAddEnabled } from "../security/centralDeclaredNameTechnicianAddHttp.js";

/**
 * R12-02D/#345. Atomic declaration of a technician's NAME during maintenance
 * or follow-up. Human Hub user signs the declaration; this never authenticates
 * the named technician and never inherits the verified PIN/RFID handler.
 *
 * Lock order: central user -> workstation -> machine -> sorted technician IDs.
 * Cross-call exclusivity includes legacy sessions with technicianName only.
 * The domain transition and distinct audit event share one PostgreSQL tx.
 */
export function runCentralDeclaredNameTechnicianAdd(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string;
    workstationId: string;
    callId: string;
    technicianNames: unknown;
    requestId?: string;
    ipAddress?: string;
  },
) {
  if (!centralDeclaredNameTechnicianAddEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  const names = parseDeclaredTechnicianNames(input.technicianNames);

  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    if (principal.purpose !== "normal" || principal.accountType !== "person")
      throw new AccessError("permission_denied");

    const selectStation = {
      active: true, pendingApproval: true,
      allowOperational: true, allowBi: true, allowPriorities: true,
    } as const;
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: selectStation,
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertPermission(principal, "calls.technicians.manage");

    const reference = await tx.andonCall.findUnique({
      where: { id: input.callId }, select: { machineId: true },
    });
    if (!reference || (principal.machineScope !== "all" &&
        !principal.machineIds.includes(reference.machineId)))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, reference.machineId);

    // Revocations made while waiting for the locks invalidate the write.
    const latest = await resolveSession(tx, request);
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId ||
        latest.purpose !== "normal" || latest.accountType !== "person")
      throw new AccessError("authentication_required", 401);
    const currentStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: selectStation,
    });
    if (!currentStation?.active || currentStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, currentStation, "operational");
    if (latest.machineScope !== "all" &&
        !latest.machineIds.includes(reference.machineId))
      throw new AccessError("call_not_found", 404);
    assertPermission(latest, "calls.technicians.manage", reference.machineId);
    if (!centralDeclaredNameTechnicianAddEnabled())
      throw new AccessError("central_action_not_supported");

    let call = await tx.andonCall.findUnique({
      where: { id: input.callId }, include: { machine: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (!call.machine.isActive) throw new AccessError("machine_inactive", 409);
    if (call.isSystemTest) throw new AccessError("system_test_transition_denied");
    if (call.category !== "maintenance" ||
        (call.status !== "in_progress" && call.status !== "post_maintenance"))
      throw new AccessError("call_state_changed", 409);

    const expectedSubtype = call.subtype;
    const original = await resolveActiveNames(tx, names);
    if (!expectedSubtype || original.some(t =>
        !getTechnicianTechnicalAreas(t).includes(expectedSubtype)))
      throw new AccessError("technician_area_denied");
    // Sorted stable advisory locks shared with PIN/RFID attendance and add.
    for (const id of original.map(t => t.id).sort())
      await lockTechnicianSessionFlow(tx, id);
    const refreshed = await resolveActiveNames(tx, names);
    if (refreshed.some((t, index) => t.id !== original[index]?.id))
      throw new AccessError("technician_identity_changed", 409);
    if (refreshed.some(t => !getTechnicianTechnicalAreas(t).includes(expectedSubtype)))
      throw new AccessError("technician_area_denied");

    // Reuse the central/legacy session guard for cross-call and same-call
    // active sessions, including older rows with name but no technician ID.
    const missing = await lockAndFindMissingActiveTechnicians(tx, {
      callId: call.id, technicians: refreshed,
    });
    if (missing.length !== refreshed.length)
      throw new AccessError("technician_already_attending", 409);
    const active = await tx.technicianSession.count({
      where: { callId: call.id, endedAt: null },
    });
    if (active + missing.length > 6)
      throw new AccessError("technician_limit_exceeded", 409);

    call = await tx.andonCall.findUnique({
      where: { id: input.callId }, include: { machine: true },
    });
    if (!call || call.machineId !== reference.machineId)
      throw new AccessError("call_not_found", 404);
    if (!call.machine.isActive || call.isSystemTest ||
        call.category !== "maintenance" ||
        (call.status !== "in_progress" && call.status !== "post_maintenance") ||
        call.subtype !== expectedSubtype)
      throw new AccessError("call_state_changed", 409);
    if (!centralDeclaredNameTechnicianAddEnabled())
      throw new AccessError("central_action_not_supported");

    const updated = await persistAddedTechnicianSessions(tx, {
      currentCall: call, technicians: refreshed,
      missingTechnicians: refreshed, workstationId: input.workstationId,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "calls.technicians.add.declared",
      resourceType: "andon_call",
      resourceId: call.id,
      machineId: call.machineId,
      reason: "operator_selected_name",
      after: {
        technicianIds: refreshed.map(t => t.id),
        identificationMethod: "name",
        identityVerified: false,
        declaredByUserId: latest.userId,
        declaredBySessionId: latest.sessionId,
        declaredAt: new Date(),
        phase: call.status === "post_maintenance" ? "follow_up" : "maintenance",
      },
    });
    return updated;
  });
}
