import { Prisma } from "@prisma/client";

export const MACHINE_PRIORITY_LOCK_KEY = "andon-machine-priority";

export async function lockMachinePriorityFlow(
  tx: Prisma.TransactionClient,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${MACHINE_PRIORITY_LOCK_KEY})
    )::text AS "lockResult"
  `);
}
