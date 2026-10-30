import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { identifyTechnician, toPublicTechnician } from "../services/technicianIdentity.js";
import { normalizeCredential } from "../security/technicianCredentials.js";
import { assertCentralTechnicianIdentityPrivilege } from "../security/centralTechnicianIdentityHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

const FAILED_WINDOW_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 8;
const attempts = new Map<string, { failed: number; expires: number }>();

function checkIdentificationBudget(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.expires > now && current.failed >= MAX_FAILED_ATTEMPTS)
    throw new AccessError("technician_identification_throttled", 429);
  if (current && current.expires <= now) attempts.delete(key);
}
function recordUnrecognizedCredential(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.expires <= now) {
    attempts.set(key, { failed: 1, expires: now + FAILED_WINDOW_MS });
  } else {
    current.failed += 1;
  }
  // Avoid unbounded key retention; never store PINs, RFID values or raw cookies.
  if (attempts.size > 4096)
    for (const [candidate, value] of attempts)
      if (value.expires <= now) attempts.delete(candidate);
}

/**
 * SEC-04: a credential preflight is NOT a write authorization. The later
 * attendance/add/end mutation re-identifies PIN/RFID under its own locks.
 * Fail-closed on central session, approved workstation, call origin and scope.
 */
export async function runCentralTechnicianIdentification(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; callId: string;
    method: unknown; value: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId) ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(input.callId))
    throw new AccessError("invalid_input", 400);
  const credential = normalizeCredential(input.method, input.value);
  if (!credential) throw new AccessError("invalid_technician_credential", 400);
  const key = tokenHash(input.token);
  checkIdentificationBudget(key);

  const result = await db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: key }, select: { userId: true },
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
    assertCentralTechnicianIdentityPrivilege(principal);
    const call = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { id: true, machineId: true, category: true, status: true, isSystemTest: true },
    });
    if (!call) throw new AccessError("call_not_found", 404);
    if (principal.machineScope !== "all" &&
        !principal.machineIds.includes(call.machineId))
      throw new AccessError("call_not_found", 404);
    await lockMachineFlow(tx, call.machineId);
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId ||
        latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralTechnicianIdentityPrivilege(latest);
    assertPermission(latest, latest.isPrimaryAdmin || latest.permissions.includes("calls.attend")
      ? "calls.attend" : "calls.technicians.manage", call.machineId);

    const refreshed = await tx.andonCall.findUnique({
      where: { id: input.callId },
      select: { machineId: true, category: true, status: true, isSystemTest: true },
    });
    if (!refreshed || refreshed.machineId !== call.machineId ||
        refreshed.category !== "maintenance" || refreshed.isSystemTest ||
        !["open", "in_progress", "post_maintenance"].includes(refreshed.status))
      throw new AccessError("call_not_identifiable", 409);

    const technician = await identifyTechnician(credential, tx);
    if (!technician) return null;
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: "technician.credential.identified",
      resourceType: "andon_call", resourceId: input.callId,
      machineId: call.machineId,
      after: { technicianId: technician.id, method: credential.method },
    });
    return toPublicTechnician(technician);
  });
  if (!result) {
    recordUnrecognizedCredential(key);
    throw new AccessError("technician_not_recognized", 404);
  }
  return result;
}
