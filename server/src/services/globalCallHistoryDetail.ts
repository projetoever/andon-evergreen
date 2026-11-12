import type { Prisma } from "@prisma/client";
import { AccessError } from "../access/policy.js";

/** Never use findUnique(id) for global detail: intersection with the current
 * server-bound machine scope MUST happen in the database, before includes.
 */
export function scopedGlobalCallDetailWhere(
  callId: string,
  allowedMachineIds: readonly string[] | null,
): Prisma.AndonCallWhereInput {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(callId))
    throw new AccessError("invalid_history_call_id", 400);
  return {
    AND: [
      { id: callId },
      ...(allowedMachineIds === null
        ? []
        : [{ machineId: { in: [...allowedMachineIds] } }]),
    ],
  };
}
