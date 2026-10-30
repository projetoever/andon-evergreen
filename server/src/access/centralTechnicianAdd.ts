import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import {
  identifyTechnician, getTechnicianTechnicalAreas, type IdentifiedTechnician,
} from "../services/technicianIdentity.js";
import { normalizeCredential } from "../security/technicianCredentials.js";
import {
  lockAndFindMissingActiveTechnicians, persistAddedTechnicianSessions,
} from "../routes/andonCalls.js";

/**
 * SEC-04/2M. Guarded add during maintenance or follow-up.
 * Lock order: user -> workstation -> machine -> sorted technicians.
 * Credentials are verified before/after technical locks; domain and audit
 * commit or roll back together. Never accepts browser-supplied technician ID.
 */
export function runCentralTechnicianAdd(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    credentials: Array<{ method?: unknown; value?: unknown }>;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_action_resource", 400);
  if (!Array.isArray(input.credentials) || input.credentials.length < 1 ||
      input.credentials.length > 6)
    throw new AccessError("technician_credentials_invalid", 400);
  const credentials = input.credentials.map(credential =>
    normalizeCredential(credential?.method, credential?.value));
  if (credentials.some(credential => !credential))
    throw new AccessError("technician_credential_required", 400);

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
    assertPermission(latest, "calls.technicians.manage", reference.machineId);

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

    // First resolve identities from credential hashes; never use names/IDs
    // claimed by the browser. A PIN and RFID of the same person are duplicates.
    const original: IdentifiedTechnician[] = [];
    for (const credential of credentials) {
      const technician = await identifyTechnician(credential!, tx);
      if (!technician) throw new AccessError("technician_credential_invalid");
      original.push(technician);
    }
    if (new Set(original.map(tech => tech.id)).size !== original.length)
      throw new AccessError("duplicate_technician", 409);
    if (!call.subtype || original.some(tech =>
        !getTechnicianTechnicalAreas(tech).includes(call.subtype!)))
      throw new AccessError("technician_area_denied");

    // The legacy helper acquires technician locks in stable ID order, checks
    // active status and blocks any other active call (including legacy names).
    const missing = await lockAndFindMissingActiveTechnicians(tx, {
      callId: call.id, technicians: original,
    });
    // Re-identify after locks to catch changes/revocations made by Admin.
    // Persist the post-lock technician/shift snapshot rather than stale input.
    const verifiedTechnicians: IdentifiedTechnician[] = [];
    for (let i = 0; i < credentials.length; i++) {
      const verified = await identifyTechnician(credentials[i]!, tx);
      if (!verified || verified.id !== original[i].id ||
          !getTechnicianTechnicalAreas(verified).includes(call.subtype!))
        throw new AccessError("technician_credential_invalid");
      verifiedTechnicians.push(verified);
    }
    if (missing.length !== original.length)
      throw new AccessError("technician_already_attending", 409);

    // No more than six concurrent maintainers on one call.
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
    if (call.isSystemTest || call.category !== "maintenance" ||
        (call.status !== "in_progress" && call.status !== "post_maintenance") ||
        !call.subtype || original.some(tech =>
          !getTechnicianTechnicalAreas(tech).includes(call.subtype!)))
      throw new AccessError("call_state_changed", 409);
    const updated = await persistAddedTechnicianSessions(tx, {
      currentCall: call, technicians: verifiedTechnicians,
      missingTechnicians: verifiedTechnicians, workstationId: input.workstationId,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "calls.technicians.add", resourceType: "andon_call",
      resourceId: input.callId, machineId: reference.machineId,
      after: {
        technicianIds: original.map(tech => tech.id),
        phase: call.status === "post_maintenance" ? "follow_up" : "maintenance",
      },
    });
    return updated;
  });
}
