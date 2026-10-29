import type { Prisma } from "@prisma/client";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { AccessError } from "./policy.js";
import { preflightCentralCallWrite, type CentralCallWritePreflightInput } from "./centralCallWritePreflight.js";

/**
 * SEC-04/2A.2 — Resource/state guard for attendance in a caller-owned Prisma
 * interactive transaction. This function does NOT perform a transition or
 * grant central write access. Callers must retain the transaction until
 * the domain mutation AND appendAudit have completed.
 *
 * The second read happens after obtaining the same per-machine advisory
 * transaction lock used by existing Andon call handlers.
 */
export type LockedAttendanceInput = {
  tx: Prisma.TransactionClient;
  principal: CentralCallWritePreflightInput["principal"];
  workstation: CentralCallWritePreflightInput["workstation"];
  callId: string;
};

export type LockedAttendanceContext = {
  callId: string;
  machineId: string;
  category: string;
  status: "open";
};

export async function authorizeCentralAttendanceAfterLock({
  tx,
  principal,
  workstation,
  callId,
}: LockedAttendanceInput): Promise<LockedAttendanceContext> {
  if (!callId || !callId.trim()) throw new AccessError("invalid_action_resource", 400);
  const request = {
    method: "PATCH",
    path: `/api/andon-calls/${encodeURIComponent(callId)}/attend`,
    callId,
  };

  // Permission and workstation checks run BEFORE a call database lookup;
  // other machines are indistinguishable from missing calls.
  const authorized = await preflightCentralCallWrite({
    principal,
    workstation,
    request,
    resolveCallMachineId: async (id) => {
      const current = await tx.andonCall.findUnique({
        where: { id },
        select: { machineId: true },
      });
      return current?.machineId ?? null;
    },
  });

  // Reuse the operational advisory transaction lock; do not introduce a
  // competing lock key/order for simultaneous multi-technician attendance.
  await lockMachineFlow(tx, authorized.machineId);

  const current = await tx.andonCall.findUnique({
    where: { id: callId },
    select: {
      machineId: true,
      category: true,
      status: true,
      isSystemTest: true,
    },
  });
  if (!current || current.machineId !== authorized.machineId) {
    throw new AccessError("call_not_found", 404);
  }
  if (current.status !== "open") {
    throw new AccessError("call_state_changed", 409);
  }
  if (current.isSystemTest) {
    throw new AccessError("system_test_transition_denied");
  }

  const machine = await tx.machine.findUnique({
    where: { id: current.machineId },
    select: { isActive: true },
  });
  if (!machine || !machine.isActive) {
    throw new AccessError("machine_inactive", 409);
  }

  // Return a verified *read context*, not authorization to bypass the
  // existing technician PIN/session, workstation ownership, transaction
  // status rechecks or compulsory durable audit in any future handler.
  return {
    callId,
    machineId: current.machineId,
    category: current.category,
    status: "open",
  };
}
