import { Prisma } from "@prisma/client";

/**
 * Prevent accidental reuse of an operator-entered work order across independent
 * call openings. The existing history is never rewritten or deduplicated.
 * A single batch may contain several sectors for the same OS (one submission).
 * The caller MUST invoke this once inside the opening transaction, before any
 * calls are inserted. PostgreSQL transaction advisory lock serializes attempts
 * from different machines and workstations on the same normalized OS.
 */
export class DuplicateWorkOrderNumberError extends Error {
  readonly code = "work_order_number_duplicate";
  constructor() {
    super("Esta OS já foi utilizada em outro chamado. Informe um número de OS diferente.");
  }
}

export function normalizedWorkOrderKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function assertWorkOrderNumberAvailable(
  tx: Prisma.TransactionClient,
  workOrderNumber: string | undefined,
  isSystemTest = false,
): Promise<void> {
  if (!workOrderNumber || isSystemTest) return;

  const settings = await tx.systemSettings.findUnique({
    where: { id: "global" },
    select: { preventDuplicateWorkOrderNumbers: true },
  });
  if (settings?.preventDuplicateWorkOrderNumbers !== true) return;

  const normalized = normalizedWorkOrderKey(workOrderNumber);
  if (!normalized) return;
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtext(${"andon-os-unique:" + normalized}))::text
  `);
  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM andon_calls
    WHERE "workOrderNumber" IS NOT NULL AND "isSystemTest" = FALSE
      AND upper(regexp_replace(btrim("workOrderNumber"), '[[:space:]]+', ' ', 'g')) = ${normalized}
    LIMIT 1
  `);
  if (existing.length) throw new DuplicateWorkOrderNumberError();
}
