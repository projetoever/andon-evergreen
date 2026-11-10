import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { assertCentralMachineSettingsPrivilege } from "../security/centralMachineSettingsHttp.js";
import { centralMachineInventoryEnabled } from "../security/centralMachineInventoryHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

const MACHINE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const INVENTORY_LIMIT = 100;
const MAX_LIMIT = 200;

export function parseCentralMachineInventoryQuery(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AccessError("invalid_input", 400);
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some(key => key !== "cursor" && key !== "limit"))
    throw new AccessError("invalid_input", 400);
  const cursor = query.cursor === undefined ? undefined : query.cursor;
  if (cursor !== undefined && (typeof cursor !== "string" || !MACHINE_ID.test(cursor)))
    throw new AccessError("invalid_input", 400);
  const limit = query.limit === undefined ? INVENTORY_LIMIT : Number(query.limit);
  if ((query.limit !== undefined &&
       (typeof query.limit !== "string" || !/^[1-9][0-9]{0,2}$/.test(query.limit))) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new AccessError("invalid_input", 400);
  return { cursor: cursor as string | undefined, limit };
}

export async function readCentralMachineInventory(
  db: Pick<PrismaClient, "$transaction">,
  input: { token: string; workstationId: string; query: unknown },
) {
  if (!centralMachineInventoryEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  const { cursor, limit } = parseCentralMachineInventoryQuery(input.query);
  return db.$transaction(async tx => {
    const row = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!row) throw new AccessError("authentication_required", 401);
    await lockUser(tx, row.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== row.userId)
      throw new AccessError("authentication_required", 401);
    const selected = {
      active: true, pendingApproval: true, allowOperational: true,
      allowBi: true, allowPriorities: true,
    } as const;
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: selected,
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralMachineSettingsPrivilege(principal);

    // Check again after locks and just before the privileged read. Grants
    // never follow a role name, workstation IP or machineScope bypass.
    const fresh = await resolveSession(tx, request);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: selected,
    });
    if (fresh.sessionId !== principal.sessionId || fresh.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(fresh, freshStation, "operational");
    assertCentralMachineSettingsPrivilege(fresh);
    if (!centralMachineInventoryEnabled())
      throw new AccessError("central_action_not_supported");
    const rows = await tx.machine.findMany({
      where: cursor === undefined ? undefined : { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true, name: true,
        requireWorkOrderAtOpen: true, isActive: true,
      },
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }, { timeout: 15_000 });
}
