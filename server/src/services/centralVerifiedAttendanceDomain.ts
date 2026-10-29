import type { PrismaClient } from "@prisma/client";
import {
  runCentralAttendanceWithVerifiedTechnician,
  type CentralAttendanceCredential,
} from "../access/centralVerifiedTechnicianAttendance.js";
import { applyVerifiedCentralAttendanceDomainTransition } from "../routes/andonCalls.js";

/**
 * SEC-04/2A.9b1. Server-only adapter. The HTTP central-write gate stays closed.
 * This fixes the domain callback to the same transition used by the legacy
 * route, instead of accepting a caller-supplied mutation or technician ID.
 *
 * Reuses the guard's single transaction for user/workstation/machine/technician
 * locks, PIN/RFID checks, domain transition and append-only AuditEvent.
 */
export function runCentralVerifiedAttendanceDomain(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string;
    workstationId: string;
    callId: string;
    credential: CentralAttendanceCredential;
    requestId?: string;
    ipAddress?: string;
  },
) {
  return runCentralAttendanceWithVerifiedTechnician(db, {
    ...input,
    applyAttendance: (tx, call, technician) =>
      applyVerifiedCentralAttendanceDomainTransition(
        tx,
        call,
        technician,
        input.workstationId,
      ),
  });
}
