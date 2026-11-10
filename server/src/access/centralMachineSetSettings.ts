import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import {
  assertCentralMachineSetSettingsPrivilege, centralMachineSetSettingsEnabled,
} from "../security/centralMachineSetSettingsHttp.js";

const MACHINE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const FIELDS = new Set(["name", "code", "typeId", "description", "isActive", "displayOrder"]);
type SetPatch = {
  name?: string;
  code?: string;
  typeId?: string;
  description?: string | null;
  isActive?: boolean;
  displayOrder?: number | null;
};

function textField(value: unknown, limit = 120) {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
    throw new AccessError("invalid_input", 400);
  const text = value.trim();
  if (!text || [...text].length > limit)
    throw new AccessError("invalid_input", 400);
  return text;
}
function normalizeCode(value: string) {
  return value.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}
function codeField(value: unknown) {
  const code = normalizeCode(textField(value, 120));
  if (!code || code.length > 80) throw new AccessError("invalid_input", 400);
  return code;
}
export function parseCentralSetBody(body: unknown, operation: "create" | "update"): SetPatch {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const payload = body as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (!keys.length || keys.some(key => !FIELDS.has(key)))
    throw new AccessError("invalid_input", 400);
  const result: SetPatch = {};
  if ("name" in payload) result.name = textField(payload.name);
  if ("code" in payload) result.code = codeField(payload.code);
  if ("typeId" in payload) result.typeId = textField(payload.typeId, 160);
  if ("description" in payload) {
    if (payload.description === null || payload.description === "")
      result.description = null;
    else if (typeof payload.description !== "string" ||
        /[\x00-\x1f\x7f]/.test(payload.description) ||
        payload.description.length > 1000)
      throw new AccessError("invalid_input", 400);
    else result.description = payload.description.trim() || null;
  }
  if ("isActive" in payload) {
    if (typeof payload.isActive !== "boolean")
      throw new AccessError("invalid_input", 400);
    result.isActive = payload.isActive;
  }
  if ("displayOrder" in payload) {
    if (payload.displayOrder === null || payload.displayOrder === "")
      result.displayOrder = null;
    else if (typeof payload.displayOrder === "number" &&
        Number.isInteger(payload.displayOrder) &&
        payload.displayOrder >= 0 && payload.displayOrder <= 9999)
      result.displayOrder = payload.displayOrder;
    else throw new AccessError("invalid_input", 400);
  }
  if (operation === "create") {
    if (!result.name || !result.typeId) throw new AccessError("invalid_input", 400);
    result.code ??= codeField(result.name);
  }
  return result;
}
const setTypeSelect = {
  id: true, code: true, name: true, isActive: true,
} as const;

function snapshot(record: {
  machineId: string; code: string; name: string; typeId: string | null;
  type: string | null; description: string | null; isActive: boolean;
  displayOrder: number | null;
}) {
  return {
    machineId: record.machineId, code: record.code, name: record.name,
    typeId: record.typeId, type: record.type,
    description: record.description, isActive: record.isActive,
    displayOrder: record.displayOrder,
  };
}

/**
 * #368/R12-04D1: a global ANDON settings delegate may configure machine
 * asset metadata, NOT operate calls or physical machine states. Resolve
 * ownership only after ACL, and revalidate the real human/session under locks.
 */
async function runMachineSetMutation<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string;
    machineId?: string; setId?: string;
    requestId?: string; ipAddress?: string;
  },
  mutation: (tx: Prisma.TransactionClient, machineId: string, principal:
    Awaited<ReturnType<typeof resolveSession>>) => Promise<{
      result: T; action: string; resourceId: string; before: unknown; after: unknown;
    }>,
): Promise<T> {
  if (!centralMachineSetSettingsEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (input.machineId && !MACHINE_ID.test(input.machineId))
    throw new AccessError("invalid_action_resource", 400);
  if (input.setId && !MACHINE_ID.test(input.setId))
    throw new AccessError("invalid_action_resource", 400);

  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);

    const request = { token: input.token, workstationId: input.workstationId };
    const initial = await resolveSession(tx, request);
    if (initial.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const stationFields = {
      active: true, pendingApproval: true,
      allowOperational: true, allowBi: true, allowPriorities: true,
    } as const;
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationFields,
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(initial, station, "operational");
    assertCentralMachineSetSettingsPrivilege(initial);

    // Parent machineId always comes from the URL (create) or persisted
    // machineSet.machineId (update). Never trust a client-supplied owner.
    const owner = input.machineId ?? (await tx.machineSet.findUnique({
      where: { id: input.setId! }, select: { machineId: true },
    }))?.machineId;
    if (!owner) throw new AccessError("asset_not_found", 404);
    await lockMachineFlow(tx, owner);
    // Machine flow lock coordinates with operational call transitions.
    const machine = await tx.machine.findUnique({
      where: { id: owner }, select: { isActive: true },
    });
    if (!machine) throw new AccessError("asset_not_found", 404);
    if (!machine.isActive) throw new AccessError("machine_inactive", 409);

    const latest = await resolveSession(tx, request);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationFields,
    });
    if (latest.userId !== initial.userId || latest.sessionId !== initial.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralMachineSetSettingsPrivilege(latest);
    if (!centralMachineSetSettingsEnabled())
      throw new AccessError("central_action_not_supported");

    const change = await mutation(tx, owner, latest);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: change.action, resourceType: "machine_set",
      resourceId: change.resourceId, machineId: owner,
      before: change.before, after: change.after,
    });
    return change.result;
  }, { timeout: 30_000 });
}

export function createCentralMachineSet(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; machineId: string; body: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  const body = parseCentralSetBody(input.body, "create");
  return runMachineSetMutation(db, input, async (tx, machineId) => {
    const setType = await tx.machineSetType.findUnique({
      where: { id: body.typeId! }, select: setTypeSelect,
    });
    if (!setType?.isActive) throw new AccessError("asset_type_inactive", 400);
    const existing = await tx.machineSet.findUnique({
      where: { machineId_code: { machineId, code: body.code! } },
      select: { id: true },
    });
    if (existing) throw new AccessError("asset_code_in_use", 409);
    const created = await tx.machineSet.create({
      data: {
        machineId, name: body.name!, code: body.code!,
        typeId: setType.id, type: setType.code,
        description: body.description ?? null,
        isActive: body.isActive ?? true,
        displayOrder: body.displayOrder ?? null,
      },
      include: { setType: { select: setTypeSelect } },
    });
    return {
      result: created, resourceId: created.id,
      action: "andon.machine_set.settings.create",
      before: null, after: snapshot(created),
    };
  });
}

export function updateCentralMachineSet(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; setId: string; body: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  const body = parseCentralSetBody(input.body, "update");
  return runMachineSetMutation(db, input, async (tx, machineId) => {
    // Lock this record before checks and update. No reparenting is permitted.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM machine_sets WHERE id = ${input.setId} FOR UPDATE
    `);
    const existing = await tx.machineSet.findUnique({
      where: { id: input.setId },
    });
    if (!existing || existing.machineId !== machineId)
      throw new AccessError("asset_not_found", 404);

    const identityChanged =
      (body.name !== undefined && body.name !== existing.name) ||
      (body.code !== undefined && body.code !== existing.code) ||
      (body.typeId !== undefined && body.typeId !== existing.typeId);
    const deactivating = body.isActive === false && existing.isActive;
    if (identityChanged || deactivating) {
      const activeLink = await tx.andonCall.findFirst({
        where: {
          OR: [
            { machineSetId: existing.id },
            { confirmedMachineSetId: existing.id },
          ],
          status: { in: ["open", "in_progress", "post_maintenance"] },
        },
        select: { id: true },
      });
      if (activeLink) throw new AccessError("asset_has_active_call", 409);
    }
    if (identityChanged) {
      // No rewriting snapshots for closed historical interventions.
      const anyHistory = await tx.andonCall.findFirst({
        where: { OR: [
          { machineSetId: existing.id },
          { confirmedMachineSetId: existing.id },
        ] }, select: { id: true },
      });
      if (anyHistory) throw new AccessError("asset_has_history", 409);
    }
    if (deactivating) {
      const activeChildren = await tx.machineSubset.count({
        where: { machineSetId: existing.id, isActive: true },
      });
      if (activeChildren) throw new AccessError("asset_has_active_subsets", 409);
    }
    let typeId = existing.typeId;
    let type = existing.type;
    if (body.typeId && body.typeId !== existing.typeId) {
      const nextType = await tx.machineSetType.findUnique({
        where: { id: body.typeId }, select: setTypeSelect,
      });
      if (!nextType?.isActive) throw new AccessError("asset_type_inactive", 400);
      typeId = nextType.id;
      type = nextType.code;
    }

    if (body.code && body.code !== existing.code) {
      const duplicate = await tx.machineSet.findUnique({
        where: { machineId_code: { machineId, code: body.code } },
        select: { id: true },
      });
      if (duplicate) throw new AccessError("asset_code_in_use", 409);
    }
    const updated = await tx.machineSet.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.displayOrder !== undefined ? { displayOrder: body.displayOrder } : {}),
        ...(body.typeId !== undefined ? { typeId, type } : {}),
      },
      include: { setType: { select: setTypeSelect } },
    });
    return {
      result: updated, resourceId: existing.id,
      action: "andon.machine_set.settings.update",
      before: snapshot(existing), after: snapshot(updated),
    };
  });
}
