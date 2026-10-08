import { Prisma } from "@prisma/client";

export async function lockAndonCategoryFlow(
  tx: Prisma.TransactionClient,
  categoryId: string,
) {
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(
      hashtext(${`andon-category:${categoryId}`})
    )::text AS "lockResult"
  `);
}
