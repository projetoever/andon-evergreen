import type { PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";
import { verifyDeclaredCentralTechnicians } from "./centralDeclaredTechnicianVerification.js";
import { applyVerifiedCentralAttendanceDomainTransitionMany } from "../routes/andonCalls.js";

/**
 * REFINE 13 / #345: first real transaction boundary for a name-declared
 * start-of-attendance. The logged-in Hub user, not the named technician,
 * is the accountable actor. No HTTP route is enabled by this module.
 */
export function runCentralDeclaredAttendance(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string;
    workstationId: string;
    callId: string;
    technicianIds: unknown;
    requestId?: string;
    ipAddress?: string;
  },
) {
  if (!Array.isArray(input.technicianIds) ||
      input.technicianIds.length < 1 || input.technicianIds.length > 6) {
    throw new AccessError("declared_technicians_invalid", 400);
  }
  return runCentralAttendanceWithAtomicAudit(db, {
    token: input.token,
    workstationId: input.workstationId,
    callId: input.callId,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    identificationMethod: "name_declared",
    verifyAndApplyAttendance: async (tx, call) => {
      const technicians = await verifyDeclaredCentralTechnicians(
        tx, call, input.technicianIds,
      );
      const value = await applyVerifiedCentralAttendanceDomainTransitionMany(
        tx, call, technicians, input.workstationId,
      );
      const technicianIds = technicians.map((t) => t.id);
      return {
        value,
        technicianId: technicianIds[0]!,
        technicianIds,
      };
    },
  });
}
