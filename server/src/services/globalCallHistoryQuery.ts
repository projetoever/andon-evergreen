import type { Prisma } from "@prisma/client";
import { AccessError } from "../access/policy.js";
import { callMachineReadWhere } from "../security/callReadScope.js";

export interface GlobalHistoryQuery {
  machineId?: string;
  status?: string;
  criticality?: string;
  subtype?: string;
  technician?: string;
  failureClassification?: string;
  reasonId?: string;
  origin?: string;
  query?: string;
  openedFrom?: string;
  openedBefore?: string;
  limit?: string;
  offset?: string;
}

/**
 * Server-side query for the global History left column.
 * The authenticated machine scope is INTERSECTED in Prisma SQL before
 * COUNT, pagination or SELECT. Never accept a list of allowed IDs from HTTP.
 */
export function buildScopedGlobalHistoryQuery(
  raw: GlobalHistoryQuery,
  allowedMachineIds: readonly string[] | null,
) {
  const str = (value: unknown, maxLength = 100) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !value.trim() || value.length > maxLength)
      throw new AccessError("invalid_history_filter", 400);
    return value.trim();
  };
  const machineId = str(raw.machineId, 128);
  const status = str(raw.status, 30);
  const criticality = str(raw.criticality, 16);
  const subtype = str(raw.subtype, 80);
  const technician = str(raw.technician, 120);
  const failureClassification = str(raw.failureClassification, 100);
  const reasonId = str(raw.reasonId, 80);
  const origin = str(raw.origin, 15);
  const query = str(raw.query, 100);
  if (status && !["open", "in_progress", "post_maintenance", "finished", "cancelled"].includes(status))
    throw new AccessError("invalid_history_filter", 400);
  if (criticality && !["low", "medium", "high", "critical"].includes(criticality))
    throw new AccessError("invalid_history_filter", 400);
  if (origin && !["real", "system"].includes(origin))
    throw new AccessError("invalid_history_filter", 400);

  const integer = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,5})$/.test(value))
      throw new AccessError("invalid_history_pagination", 400);
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n > max || (max === 100 && n < 1))
      throw new AccessError("invalid_history_pagination", 400);
    return n;
  };
  const take = integer(raw.limit, 25, 100);
  const skip = integer(raw.offset, 0, 10000);

  // Browser must convert local-calendar period to absolute ISO instants.
  // Server never guesses timezone from the host machine or IP.
  const instant = (value: unknown) => {
    const s = str(value, 35);
    if (!s) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(s))
      throw new AccessError("invalid_history_period", 400);
    const date = new Date(s);
    if (!Number.isFinite(date.getTime())) throw new AccessError("invalid_history_period", 400);
    return date;
  };
  const openedFrom = instant(raw.openedFrom);
  const openedBefore = instant(raw.openedBefore);
  if (openedFrom && openedBefore && openedFrom >= openedBefore)
    throw new AccessError("invalid_history_period", 400);

  const where: Prisma.AndonCallWhereInput = {
    ...callMachineReadWhere(machineId, allowedMachineIds),
    ...(status ? { status } : {}),
    ...(criticality ? { criticality } : {}),
    ...(subtype ? { subtype } : {}),
    ...(failureClassification ? { failureClassification } : {}),
    ...(origin ? { isSystemTest: origin === "system" } : {}),
    ...(reasonId ? { callReasonSnapshot: { is: { reasonId } } } : {}),
    ...(openedFrom || openedBefore
      ? { openedAt: {
          ...(openedFrom ? { gte: openedFrom } : {}),
          ...(openedBefore ? { lt: openedBefore } : {}),
        } }
      : {}),
    ...(technician ? { OR: [
      { technicianName: { equals: technician, mode: "insensitive" as const } },
      { technicianSessions: { some: {
        technicianName: { equals: technician, mode: "insensitive" as const },
      } } },
    ] } : {}),
  };
  if (query) {
    const fields: Prisma.AndonCallWhereInput[] = [
      { id: { contains: query, mode: "insensitive" } },
      { workOrderNumber: { contains: query, mode: "insensitive" } },
      { subtype: { contains: query, mode: "insensitive" } },
      { failureDescription: { contains: query, mode: "insensitive" } },
      { failureClassification: { contains: query, mode: "insensitive" } },
      { notes: { contains: query, mode: "insensitive" } },
      { technicianName: { contains: query, mode: "insensitive" } },
      { machineSetNameSnapshot: { contains: query, mode: "insensitive" } },
      { machineSubsetNameSnapshot: { contains: query, mode: "insensitive" } },
      { technicianSessions: { some: {
        technicianName: { contains: query, mode: "insensitive" },
      } } },
    ];
    // Separate AND prevents the query search from weakening machine scope
    // or a previous technician OR filter.
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: fields }];
  }
  return {
    where,
    take,
    skip,
    orderBy: [{ openedAt: "desc" as const }, { id: "desc" as const }],
  };
}
