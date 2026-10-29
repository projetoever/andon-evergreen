import type { Prisma } from "@prisma/client";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import {
  getTechnicianTechnicalAreas,
  identifyTechnician,
  type IdentifiedTechnician,
} from "../services/technicianIdentity.js";
import { normalizeCredential } from "../security/technicianCredentials.js";
import { AccessError } from "./policy.js";
import type { CentralAttendanceCredential } from "./centralVerifiedTechnicianAttendance.js";
import type { LockedAttendanceContext } from "./centralCallTransactionalGuard.js";

export type VerifiedCentralTechnician = Pick<IdentifiedTechnician, "id" | "name" | "employeeId">;
export const MAX_CENTRAL_ATTENDANCE_TECHNICIANS = 6;

/**
 * SEC-04/2A.9b2a. Validate an entire multi-technician group inside the
 * caller's transaction. The caller must already hold the user, workstation
 * and machine locks. No partial success: any bad credential or busy technician
 * rejects the whole group before a domain transition.
 */
export async function verifyCentralAttendanceTechnicians(
  tx: Prisma.TransactionClient,
  call: LockedAttendanceContext,
  rawCredentials: CentralAttendanceCredential[],
): Promise<VerifiedCentralTechnician[]> {
  if (call.category !== "maintenance")
    throw new AccessError("maintenance_call_required", 409);
  if (!Array.isArray(rawCredentials) || rawCredentials.length < 1 ||
      rawCredentials.length > MAX_CENTRAL_ATTENDANCE_TECHNICIANS)
    throw new AccessError("technician_credentials_invalid", 400);

  const credentials = rawCredentials.map((value) =>
    normalizeCredential(value?.method, value?.value));
  if (credentials.some((value) => !value))
    throw new AccessError("technician_credential_required", 400);

  // All identities are discovered from server-owned credential hashes, not
  // names or IDs sent by the client. Reject duplicate persons even if PIN
  // and RFID are different credentials for that same person.
  const original: IdentifiedTechnician[] = [];
  for (const credential of credentials) {
    const match = await identifyTechnician(credential!, tx);
    if (!match) throw new AccessError("technician_credential_invalid");
    original.push(match);
  }
  if (new Set(original.map((t) => t.id)).size !== original.length)
    throw new AccessError("duplicate_technician", 409);

  // Sorting by stable DB ID prevents cycles when different requests submit
  // the same set of technicians in opposite orders.
  const orderedIds = original.map((t) => t.id).sort();
  for (const id of orderedIds) await lockTechnicianSessionFlow(tx, id);

  // All PINs/RFID and names/areas are revalidated AFTER obtaining every
  // technician lock. Admin credential edits use these same advisory locks.
  const verified: IdentifiedTechnician[] = [];
  for (let i = 0; i < credentials.length; i++) {
    const match = await identifyTechnician(credentials[i]!, tx);
    if (!match || match.id !== original[i].id)
      throw new AccessError("technician_credential_invalid");
    verified.push(match);
  }

  const current = await tx.andonCall.findUnique({
    where: { id: call.callId },
    select: { machineId: true, category: true, status: true, subtype: true, isSystemTest: true },
  });
  if (!current || current.machineId !== call.machineId)
    throw new AccessError("call_not_found", 404);
  if (current.isSystemTest) throw new AccessError("system_test_transition_denied");
  if (current.status !== "open" || current.category !== "maintenance")
    throw new AccessError("call_state_changed", 409);
  if (!current.subtype || verified.some((t) =>
    !getTechnicianTechnicalAreas(t).includes(current.subtype!)))
    throw new AccessError("technician_area_denied");

  const sessions = await tx.technicianSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { technicianId: { in: orderedIds } },
        ...verified.map((t) => ({
          technicianId: null,
          technicianName: { equals: t.name, mode: "insensitive" as const },
        })),
      ],
    },
    select: { callId: true, machineId: true, technicianId: true, technicianName: true },
  });
  if (sessions.length) throw new AccessError("technician_already_attending", 409);

  // Keep original credential order for names and the primary technician,
  // matching the existing multi-technician legacy handler.
  return verified.map((t) => ({ id: t.id, name: t.name, employeeId: t.employeeId }));
}
