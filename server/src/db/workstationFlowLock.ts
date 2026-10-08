import { Prisma } from "@prisma/client";

export async function lockWorkstationFlow(
  tx: Prisma.TransactionClient,
  workstationId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${`andon-workstation:${workstationId}`})
    )::text AS "lockResult"
  `);
}
