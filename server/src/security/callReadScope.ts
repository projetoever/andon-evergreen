import type { Prisma } from "@prisma/client";

/**
 * Intersect a requested machine with the authenticated user's machine scope.
 * Filters are pushed into Prisma's SQL query BEFORE LIMIT, ordering and includes.
 * An empty allowed list matches no rows, never an unrestricted collection.
 */
export function callMachineReadWhere(
  requestedMachineId: string | undefined,
  allowedMachineIds: readonly string[] | null,
): Prisma.AndonCallWhereInput {
  const constraints: Prisma.AndonCallWhereInput[] = [];
  if (requestedMachineId) constraints.push({ machineId: requestedMachineId });
  if (allowedMachineIds !== null) {
    constraints.push({ machineId: { in: [...allowedMachineIds] } });
  }
  return constraints.length ? { AND: constraints } : {};
}
