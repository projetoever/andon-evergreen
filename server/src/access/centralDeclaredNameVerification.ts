import type { Prisma } from "@prisma/client";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import {
  getTechnicianTechnicalAreas,
  technicianIdentitySelect,
  type IdentifiedTechnician,
} from "../services/technicianIdentity.js";
import { AccessError } from "./policy.js";
import type { LockedAttendanceContext } from "./centralCallTransactionalGuard.js";

/**
 * R12-02A / issue #345 — server-owned verification of catalog and availability,
 * NOT verification of the human technician's identity.
 *
 * A selected name is a declaration made by the authenticated Hub operator.
 * It MUST NOT be silently treated as a verified PIN/RFID credential.
 * This module does not expose an HTTP route or enable central name attendance.
 */
export type DeclaredNameCandidate =
  Pick<IdentifiedTechnician, "id" | "name" | "employeeId"> & {
    identificationMethod: "name";
    identityVerified: false;
  };

const MAX_DECLARED_TECHNICIANS = 6;
const MAX_NAME_LENGTH = 120;

function nameKey(name: string) {
  return name.toLocaleLowerCase("pt-BR");
}

export function parseDeclaredTechnicianNames(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DECLARED_TECHNICIANS)
    throw new AccessError("technician_names_invalid", 400);
  const names: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string" || /[\x00-\x1F\x7F]/.test(value))
      throw new AccessError("technician_names_invalid", 400);
    const name = value.trim();
    if (name.length < 2 || name.length > MAX_NAME_LENGTH)
      throw new AccessError("technician_names_invalid", 400);
    names.push(name);
  }
  if (new Set(names.map(nameKey)).size !== names.length)
    throw new AccessError("duplicate_technician", 409);
  return names;
}

/** Fail closed for missing, ambiguous or inactive names; never pick the first hit. */
async function resolveActiveNames(
  tx: Prisma.TransactionClient,
  names: readonly string[],
): Promise<IdentifiedTechnician[]> {
  const found = await tx.technician.findMany({
    where: {
      active: true,
      OR: names.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
    },
    select: technicianIdentitySelect,
  });
  const byName = new Map<string, IdentifiedTechnician>();
  for (const candidate of found) {
    const key = nameKey(candidate.name);
    if (byName.has(key))
      throw new AccessError("technician_name_ambiguous", 409);
    byName.set(key, candidate);
  }
  const selected = names.map((name) => byName.get(nameKey(name)));
  if (selected.some((candidate) => !candidate) ||
      new Set(selected.map((candidate) => candidate!.id)).size !== names.length)
    throw new AccessError("technician_not_found", 404);
  return selected as IdentifiedTechnician[];
}

/**
 * Requires the caller to own an interactive Prisma transaction and already
 * hold central user -> workstation -> machine locks with session/ACL/CSRF
 * verified by the central guard. Locks technician IDs in stable order,
 * re-resolves the declaration, rejects conflicting legacy/new sessions and
 * rechecks call state/area before any attendance domain mutation.
 *
 * NO route calls this until the R12-02 protocol, dedicated identity-declaration
 * audit event, policy flag, HTTP guard and PostgreSQL concurrency tests pass.
 */
export async function resolveCentralDeclaredNameAttendanceCandidates(
  tx: Prisma.TransactionClient,
  call: LockedAttendanceContext,
  rawNames: unknown,
): Promise<DeclaredNameCandidate[]> {
  if (call.category !== "maintenance" || call.status !== "open")
    throw new AccessError("maintenance_call_required", 409);
  const names = parseDeclaredTechnicianNames(rawNames);
  const original = await resolveActiveNames(tx, names);
  const ids = original.map((technician) => technician.id).sort();
  for (const id of ids) await lockTechnicianSessionFlow(tx, id);

  const refreshed = await resolveActiveNames(tx, names);
  if (refreshed.some((technician, index) => technician.id !== original[index]!.id))
    throw new AccessError("technician_identity_changed", 409);

  const current = await tx.andonCall.findUnique({
    where: { id: call.callId },
    select: { machineId: true, category: true, status: true, subtype: true, isSystemTest: true },
  });
  if (!current || current.machineId !== call.machineId)
    throw new AccessError("call_not_found", 404);
  if (current.isSystemTest)
    throw new AccessError("system_test_transition_denied");
  if (current.status !== "open" || current.category !== "maintenance")
    throw new AccessError("call_state_changed", 409);
  if (!current.subtype || refreshed.some((technician) =>
    !getTechnicianTechnicalAreas(technician).includes(current.subtype!)))
    throw new AccessError("technician_area_denied");

  // Include historical sessions that have only a name, not a technicianId.
  const activeSessions = await tx.technicianSession.findMany({
    where: {
      endedAt: null,
      OR: [
        { technicianId: { in: ids } },
        ...refreshed.map((technician) => ({
          technicianId: null,
          technicianName: { equals: technician.name, mode: "insensitive" as const },
        })),
      ],
    },
    select: { callId: true, technicianId: true, technicianName: true },
  });
  if (activeSessions.length)
    throw new AccessError("technician_already_attending", 409);

  return refreshed.map((technician) => ({
    id: technician.id,
    name: technician.name,
    employeeId: technician.employeeId,
    identificationMethod: "name" as const,
    identityVerified: false as const,
  }));
}
