import type { PrismaClient } from "@prisma/client";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";
import {
  verifyCentralAttendanceTechnicians,
} from "./centralMultiTechnicianVerification.js";
import type { CentralAttendanceCredential } from "./centralVerifiedTechnicianAttendance.js";
import {
  applyVerifiedCentralAttendanceDomainTransitionMany,
} from "../routes/andonCalls.js";

export type CentralMultiAttendancePrototypeInput = {
  /** Server-side authenticated session token, never a technician PIN. */
  token: string;
  workstationId: string;
  callId: string;
  credentials: CentralAttendanceCredential[];
  requestId?: string;
  ipAddress?: string;
};

/**
 * SEC-04/2A.9b2b: isolated end-to-end composition, NOT AN HTTP ROUTE.
 *
 * The caller still passes the full credential group through the existing
 * PIN/RFID verifier. The outer wrapper locks user -> workstation -> machine;
 * verification locks technicians in stable ID order, then the existing
 * attendance domain persists the call and ALL technician sessions. The
 * server-owned central principal and verified technician IDs are audited
 * in the SAME transaction. Any failure rolls the whole attempt back.
 *
 * IMPORTANT: enforceWorkstationAccess continues denying central-mode writes.
 * Do not wire this function into routes without a separate security and
 * industrial validation of CSRF, origin, authentication, replay and rollout.
 */
export function runCentralMultiTechnicianAttendancePrototype(
  db: Pick<PrismaClient, "$transaction">,
  input: CentralMultiAttendancePrototypeInput,
) {
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
      const value = await applyVerifiedCentralAttendanceDomainTransitionMany(
        tx, call, technicians, input.workstationId,
      );
      return {
        value,
        technicianId: technicians[0]!.id,
        technicianIds: technicians.map((technician) => technician.id),
      };
    },
  });
}
