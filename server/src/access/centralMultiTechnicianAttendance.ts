import type { Prisma, PrismaClient } from "@prisma/client";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";
import { verifyCentralAttendanceTechnicians } from "./centralMultiTechnicianVerification.js";
import type { CentralAttendanceCredential } from "./centralVerifiedTechnicianAttendance.js";
import type { LockedAttendanceContext } from "./centralCallTransactionalGuard.js";
import type { VerifiedCentralTechnician } from "./centralMultiTechnicianVerification.js";

/**
 * SEC-04/2A.9b2a: server-only group wrapper; no HTTP route is registered.
 * All credentials are checked under one set of ordered technician locks,
 * the domain change and the audit execute within the SAME transaction.
 */
export function runCentralAttendanceWithVerifiedTechnicians<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string;
    workstationId: string;
    callId: string;
    credentials: CentralAttendanceCredential[];
    requestId?: string;
    ipAddress?: string;
    applyAttendance: (
      tx: Prisma.TransactionClient,
      call: LockedAttendanceContext,
      technicians: VerifiedCentralTechnician[],
    ) => Promise<T>;
  },
): Promise<T> {
  return runCentralAttendanceWithAtomicAudit(db, {
    token: input.token,
    workstationId: input.workstationId,
    callId: input.callId,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    verifyAndApplyAttendance: async (tx, call) => {
      const technicians = await verifyCentralAttendanceTechnicians(
        tx, call, input.credentials,
      );
      const value = await input.applyAttendance(tx, call, technicians);
      const ids = technicians.map((t) => t.id);
      return { value, technicianId: ids[0], technicianIds: ids };
    },
  });
}
