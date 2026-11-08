import type { PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { runCentralAttendanceWithAtomicAudit } from "./centralAttendanceAtomicAudit.js";
import {
  parseDeclaredTechnicianNames,
  resolveCentralDeclaredNameAttendanceCandidates,
} from "./centralDeclaredNameVerification.js";
import { applyVerifiedCentralAttendanceDomainTransitionMany } from "../routes/andonCalls.js";
import { centralDeclaredNameAttendanceEnabled } from "../security/centralDeclaredNameAttendanceHttp.js";

export type CentralDeclaredNameAttendanceInput = {
  token: string;
  workstationId: string;
  callId: string;
  technicianNames: unknown;
  requestId?: string;
  ipAddress?: string;
};

/**
 * R12-02B1 / #345: Independent path for a Hub operator's DECLARATION of
 * technician names. It is never a PIN/RFID authentication. No HTTP route is
 * authorized unless the separate explicit feature flag is enabled.
 * The existing maintenance domain updates sessions, machine, downtime and
 * KPIs. The audit is committed in the same transaction.
 */
export function runCentralDeclaredNameAttendance(
  db: Pick<PrismaClient, "$transaction">,
  input: CentralDeclaredNameAttendanceInput,
) {
  if (!centralDeclaredNameAttendanceEnabled())
    throw new AccessError("central_action_not_supported");
  const names = parseDeclaredTechnicianNames(input.technicianNames);
  return runCentralAttendanceWithAtomicAudit(db, {
    token: input.token,
    workstationId: input.workstationId,
    callId: input.callId,
    requestId: input.requestId,
    ipAddress: input.ipAddress,
    auditIdentity: "declared_name",
    verifyAndApplyAttendance: async (tx, call) => {
      // The flag may be revoked between request admission and the transaction.
      if (!centralDeclaredNameAttendanceEnabled())
        throw new AccessError("central_action_not_supported");
      const technicians = await resolveCentralDeclaredNameAttendanceCandidates(tx, call, names);
      const value = await applyVerifiedCentralAttendanceDomainTransitionMany(
        tx, call, technicians, input.workstationId,
      );
      return {
        value,
        technicianId: technicians[0]!.id,
        technicianIds: technicians.map((tech) => tech.id),
        identificationMethod: "name" as const,
        identityVerified: false as const,
      };
    },
  });
}
