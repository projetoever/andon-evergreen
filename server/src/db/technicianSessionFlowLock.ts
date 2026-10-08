import { Prisma } from "@prisma/client";

export async function lockTechnicianSessionFlow(
  tx: Prisma.TransactionClient,
  technicianId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${`andon-technician-session:${technicianId}`})
    )::text AS "lockResult"
  `);
}
