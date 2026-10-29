import type { Prisma, PrismaClient } from "@prisma/client";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { getTechnicianTechnicalAreas, identifyTechnician, type IdentifiedTechnician } from "../services/technicianIdentity.js";
import { normalizeCredential } from "../security/technicianCredentials.js";
import { AccessError } from "./policy.js";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";
import type { LockedAttendanceContext } from "./centralCallTransactionalGuard.js";

export type CentralAttendanceCredential = { method?: unknown; value?: unknown };
type VerifiedTechnician = Pick<IdentifiedTechnician, "id" | "name" | "employeeId">;

/**
 * SEC-04/2A.9a: credential and technician-exclusivity verification for a
 * FUTURE server-side central attendance callback. This module does NOT
 * change an AndonCall, create a TechnicianSession, or enable HTTP writes.
 *
 * Caller must already hold user -> workstation -> machine transaction locks.
 */
export async function verifyCentralAttendanceTechnician(
  tx: Prisma.TransactionClient,
  call: LockedAttendanceContext,
  rawCredential: CentralAttendanceCredential,
): Promise<VerifiedTechnician> {
  if (call.category !== "maintenance") throw new AccessError("maintenance_call_required", 409);

  const credential = normalizeCredential(rawCredential?.method, rawCredential?.value);
  if (!credential) throw new AccessError("technician_credential_required", 400);

  // Reuse exactly the technician PIN/RFID verification implementation that
  // already serves legacy attendance; never accept user-supplied names or IDs.
  const initiallyIdentified = await identifyTechnician(credential, tx);
  if (!initiallyIdentified) throw new AccessError("technician_credential_invalid", 403);

  await lockTechnicianSessionFlow(tx, initiallyIdentified.id);

  // The administrative technician update also takes this lock. Re-identify
  // after lock to reject credentials changed/deactivated while waiting.
  const technician = await identifyTechnician(credential, tx);
  if (!technician || technician.id !== initiallyIdentified.id)
    throw new AccessError("technician_credential_invalid", 403);

  // Validate the call a second time after the technician lock. The machine
  // is already locked by the outer transaction, but do not rely on stale
  // subtype/sector information from the browser or preflight.
  const current = await tx.andonCall.findUnique({
    where: { id: call.callId },
    select: {
      machineId: true, category: true, subtype: true,
      status: true, isSystemTest: true,
    },
  });
  if (!current || current.machineId !== call.machineId)
    throw new AccessError("call_not_found", 404);
  if (current.isSystemTest) throw new AccessError("system_test_transition_denied");
  if (current.status !== "open" || current.category !== "maintenance")
    throw new AccessError("call_state_changed", 409);
  if (!current.subtype || !getTechnicianTechnicalAreas(technician).includes(current.subtype))
    throw new AccessError("technician_area_denied", 403);

  const sessions = await tx.technicianSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { technicianId: technician.id },
        {
          technicianId: null,
          technicianName: { equals: technician.name, mode: "insensitive" },
        },
      ],
    },
    select: {
      callId: true, machineId: true,
      technicianId: true, technicianName: true,
    },
  });
  // Do not let a technician already attending ANY active call re-attend a
  // pending call. Legacy name-only sessions also count as occupied.
  if (sessions.length) throw new AccessError("technician_already_attending", 409);
  return { id: technician.id, name: technician.name, employeeId: technician.employeeId };
}

export type VerifiedCentralAttendanceInput<T> = {
  token: string;
  workstationId: string;
  callId: string;
  credential: CentralAttendanceCredential;
  requestId?: string;
  ipAddress?: string;
  /** Server-supplied domain mutation; must preserve legacy timing and session rules. */
  applyAttendance: (
    tx: Prisma.TransactionClient,
    call: LockedAttendanceContext,
    technician: VerifiedTechnician,
  ) => Promise<T>;
};

/**
 * Creates an authenticated, credential-verified AND audited transaction boundary
 * without exposing a central HTTP handler. The domain transition remains a
 * separately reviewed callback; security verification cannot be bypassed by
 * returning an arbitrary technicianId from the request body.
 */
export function runCentralAttendanceWithVerifiedTechnician<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: VerifiedCentralAttendanceInput<T>,
): Promise<T> {
  return runCentralAttendanceWithAtomicAudit(db, {
    token: input.token,
    workstationId: input.workstationId,
    callId: input.callId,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    verifyAndApplyAttendance: async (tx, call) => {
      const technician = await verifyCentralAttendanceTechnician(tx, call, input.credential);
      const value = await input.applyAttendance(tx, call, technician);
      return { value, technicianId: technician.id };
    },
  });
}
