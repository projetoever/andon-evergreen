import type { Prisma } from "@prisma/client";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import {
  getTechnicianTechnicalAreas,
  technicianIdentitySelect,
} from "../services/technicianIdentity.js";
import { AccessError } from "./policy.js";
import type { LockedAttendanceContext } from "./centralCallTransactionalGuard.js";

/**
 * REFINE 13 / #345 — server-owned resolution of a DECLARED technician identity.
 *
 * This does not authenticate the selected technician. The actor is the
 * separately authenticated central Hub user, and audit must state
 * identificationMethod="name_declared", never "credential_verified".
 *
 * Intentionally NOT exposed through HTTP until the complete audited
 * transactional route, feature flag, and release tests are implemented.
 */
export async function verifyDeclaredCentralTechnicians(
  tx: Prisma.TransactionClient,
  call: LockedAttendanceContext,
  rawIds: unknown,
  allowedStatuses: Array<"open" | "in_progress" | "post_maintenance"> = ["open"],
) {
  if (call.category !== "maintenance") {
    throw new AccessError("maintenance_call_required", 409);
  }
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 6 ||
      rawIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 128)) {
    throw new AccessError("declared_technicians_invalid", 400);
  }
  const ids = rawIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new AccessError("duplicate_technician", 409);
  }

  // Fixed ordering avoids deadlocks between concurrent multi-tech requests.
  const initial = await tx.technician.findMany({
    where: { id: { in: ids }, active: true },
    select: technicianIdentitySelect,
  });
  if (initial.length !== ids.length) {
    throw new AccessError("technician_not_found", 404);
  }
  for (const id of [...ids].sort()) {
    await lockTechnicianSessionFlow(tx, id);
  }

  // Recheck after acquiring the exact same lock used by technician edits.
  const currentTechs = await tx.technician.findMany({
    where: { id: { in: ids }, active: true },
    select: technicianIdentitySelect,
  });
  if (currentTechs.length !== ids.length) {
    throw new AccessError("technician_not_found", 404);
  }
  const byId = new Map(currentTechs.map((t) => [t.id, t]));
  const technicians = ids.map((id) => byId.get(id)!);

  const currentCall = await tx.andonCall.findUnique({
    where: { id: call.callId },
    select: {
      machineId: true, category: true, status: true,
      subtype: true, isSystemTest: true,
    },
  });
  if (!currentCall || currentCall.machineId !== call.machineId) {
    throw new AccessError("call_not_found", 404);
  }
  if (currentCall.isSystemTest) {
    throw new AccessError("system_test_transition_denied");
  }
  if (!allowedStatuses.includes(currentCall.status as "open") || currentCall.category !== "maintenance") {
    throw new AccessError("call_state_changed", 409);
  }
  if (!currentCall.subtype || technicians.some((t) =>
      !getTechnicianTechnicalAreas(t).includes(currentCall.subtype!))) {
    throw new AccessError("technician_area_denied", 403);
  }

  const active = await tx.technicianSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { technicianId: { in: ids } },
        ...technicians.map((t) => ({
          technicianId: null,
          technicianName: { equals: t.name, mode: "insensitive" as const },
        })),
      ],
    },
    select: { technicianId: true },
  });
  if (active.length) {
    throw new AccessError("technician_already_attending", 409);
  }
  return technicians.map((t) => ({
    id: t.id,
    name: t.name,
    employeeId: t.employeeId,
  }));
}
