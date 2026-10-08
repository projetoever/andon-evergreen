import { Prisma } from "@prisma/client";

export async function lockMachineFlow(
  tx: Prisma.TransactionClient,
  machineId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${machineId}))::text AS "lockResult"
  `);
}
