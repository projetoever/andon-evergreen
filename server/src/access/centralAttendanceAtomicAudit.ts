import type { Prisma, PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { tokenHash } from "./credentials.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { lockUser, resolveSession } from "./sessions.js";
import {
  authorizeCentralAttendanceAfterLock,
  type LockedAttendanceContext,
} from "./centralCallTransactionalGuard.js";

/**
 * SEC-04/2A.3: transaction-scoped security and atomic audit prototype.
 * NOT a route hook. Central human writes still fail closed at
 * enforceWorkstationAccess, and the production attendance handler is unchanged.
 *
 * Future integration MUST supply a reviewed domain callback that verifies the
 * technician's PIN/identity, exclusive technician session and the existing
 * workstation/call state rules before performing the attendance transition.
 * This wrapper cannot replace those domain checks.
 */
type VerifiedAttendance<T> = {
  value: T;
  /** Stable ID from the domain's verified technician record, never raw client text. */
  technicianId: string;
  /** Verified IDs in credential order for atomic multi-technician attendance. */
  technicianIds?: string[];
};

export type GuardedAttendanceInput<T> = {
  token: string;
  workstationId: string;
  callId: string;
  requestId?: string;
  ipAddress?: string;
  verifyAndApplyAttendance: (
    tx: Prisma.TransactionClient,
    call: LockedAttendanceContext,
  ) => Promise<VerifiedAttendance<T>>;
};

function validateWorkstation(
  workstation: {
    active: boolean;
    pendingApproval: boolean;
    allowOperational: boolean;
    allowBi: boolean;
    allowPriorities: boolean;
  } | null,
): asserts workstation is NonNullable<typeof workstation> {
  if (!workstation || !workstation.active || workstation.pendingApproval)
    throw new AccessError("workstation_inactive");
}

export async function runCentralAttendanceWithAtomicAudit<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: GuardedAttendanceInput<T>,
): Promise<T> {
  // Do not allow malformed tokens to trigger a database lookup or lock.
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || !input.callId.trim())
    throw new AccessError("invalid_action_resource", 400);

  return db.$transaction(async (tx) => {
    const request = { token: input.token, workstationId: input.workstationId };
    // Obtain user ID only from the server-side token hash. Never trust a user
    // ID or permissions supplied by the browser.
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) },
      select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);

    // Existing user advisory lock serializes admin authorization-version
    // changes with this attempt. It MUST precede the machine lock.
    await lockUser(tx, session.userId);
    // Serialize with central/legacy workstation administration before
    // reading its current admission, active and module-allowance flags.
    // Global order for this guarded path: user -> workstation -> machine.
    await lockWorkstationFlow(tx, input.workstationId);
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);

    const workstation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        id: true,
        active: true,
        pendingApproval: true,
        allowOperational: true,
        allowBi: true,
        allowPriorities: true,
      },
    });
    validateWorkstation(workstation);

    const call = await authorizeCentralAttendanceAfterLock({
      tx, principal, workstation, callId: input.callId,
    });

    // A second read after the machine lock catches session revocation and
    // policy changes made during lock acquisition. This is NOT sufficient
    // against every future concurrent revocation path: the activation gate
    // stays closed pending a complete session-lock protocol.
    const refreshed = await resolveSession(tx, request);
    if (refreshed.userId !== principal.userId ||
        refreshed.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);

    const latestStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true,
        pendingApproval: true,
        allowOperational: true,
        allowBi: true,
        allowPriorities: true,
      },
    });
    validateWorkstation(latestStation);
    assertModule(refreshed, latestStation, "operational");
    if (refreshed.machineScope !== "all" &&
        !refreshed.machineIds.includes(call.machineId))
      throw new AccessError("call_not_found", 404);
    assertPermission(refreshed, "calls.attend", call.machineId);

    // The domain callback MUST validate technician PIN/identity, uniqueness
    // and workstation rules; no callback means no mutation.
    const result = await input.verifyAndApplyAttendance(tx, call);
    if (!result || typeof result.technicianId !== "string" ||
        !result.technicianId.trim())
      throw new AccessError("verified_technician_required");

    const multiIds = result.technicianIds;
    if (multiIds !== undefined &&
        (!Array.isArray(multiIds) || multiIds.length < 1 ||
         multiIds.length > 6 ||
         multiIds.some((id) => typeof id !== "string" || !id.trim()) ||
         multiIds[0] !== result.technicianId ||
         new Set(multiIds).size !== multiIds.length))
      throw new AccessError("verified_technician_required");

    // Both transition and audit are in the SAME Prisma transaction. A failure
    // to persist the audit rejects the transaction and rolls back the change.
    await appendAudit(tx, {
      ...actorFromPrincipal(refreshed),
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: "calls.attend",
      resourceType: "andon_call",
      resourceId: call.callId,
      machineId: call.machineId,
      after: multiIds
        ? { technicianId: result.technicianId, technicianIds: multiIds }
        : { technicianId: result.technicianId },
    });
    return result.value;
  });
}
