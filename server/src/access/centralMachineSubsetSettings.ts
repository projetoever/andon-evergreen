import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import {
  centralMachineSubsetSettingsEnabled,
} from "../security/centralMachineSubsetSettingsHttp.js";
import {
  assertCentralMachineSetSettingsPrivilege,
} from "../security/centralMachineSetSettingsHttp.js";

const ID = /^[A-Za-z0-9_-]{1,160}$/;
const FIELDS = new Set([
  "name", "code", "typeId", "description", "manufacturer", "model",
  "assetTag", "isActive", "displayOrder",
]);
type SubsetPatch = {
  name?: string; code?: string; typeId?: string;
  description?: string | null; manufacturer?: string | null;
  model?: string | null; assetTag?: string | null;
  isActive?: boolean; displayOrder?: number | null;
};

function requiredText(value: unknown, limit = 120): string {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
    throw new AccessError("invalid_input", 400);
  const str = value.trim();
  if (!str || [...str].length > limit)
    throw new AccessError("invalid_input", 400);
  return str;
}
function normalizedCode(value: unknown) {
  const code = requiredText(value).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  if (!code || code.length > 80) throw new AccessError("invalid_input", 400);
  return code;
}
export function parseCentralSubsetBody(raw: unknown, operation: "create" | "update"): SubsetPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AccessError("invalid_input", 400);
  const src = raw as Record<string, unknown>;
  const keys = Object.keys(src);
  if (!keys.length || keys.some(k => !FIELDS.has(k)))
    throw new AccessError("invalid_input", 400);
  const body: SubsetPatch = {};
  if ("name" in src) body.name = requiredText(src.name);
  if ("code" in src) body.code = normalizedCode(src.code);
  if ("typeId" in src) body.typeId = requiredText(src.typeId, 160);
  for (const field of ["description", "manufacturer", "model", "assetTag"] as const) {
    if (!(field in src)) continue;
    if (src[field] === null || src[field] === "") {
      body[field] = null;
    } else if (typeof src[field] !== "string" ||
        /[\x00-\x1f\x7f]/.test(src[field]) || src[field].length > 1000) {
      throw new AccessError("invalid_input", 400);
    } else {
      body[field] = (src[field] as string).trim() || null;
    }
  }
  if ("isActive" in src) {
    if (typeof src.isActive !== "boolean")
      throw new AccessError("invalid_input", 400);
    body.isActive = src.isActive;
  }
  if ("displayOrder" in src) {
    if (src.displayOrder === null || src.displayOrder === "") body.displayOrder = null;
    else if (typeof src.displayOrder === "number" &&
        Number.isInteger(src.displayOrder) &&
        src.displayOrder >= 0 && src.displayOrder <= 9999)
      body.displayOrder = src.displayOrder;
    else throw new AccessError("invalid_input", 400);
  }
  if (operation === "create") {
    if (!body.name || !body.typeId) throw new AccessError("invalid_input", 400);
    body.code ??= normalizedCode(body.name);
  }
  return body;
}
const typeSelect = { id: true, code: true, name: true, isActive: true } as const;
function snapshot(row: {
  machineSetId: string; name: string; code: string; typeId: string | null;
  description: string | null; manufacturer: string | null; model: string | null;
  assetTag: string | null; isActive: boolean; displayOrder: number | null;
}) {
  return {
    machineSetId: row.machineSetId, name: row.name, code: row.code,
    typeId: row.typeId, description: row.description,
    manufacturer: row.manufacturer, model: row.model, assetTag: row.assetTag,
    isActive: row.isActive, displayOrder: row.displayOrder,
  };
}

/**
 * #368/R12-04D2: ownership comes from persisted parent only. In-process
 * configured machines may differ from operational machineScope, but this
 * settings grant NEVER bypasses operational call or PLC permissions.
 */
async function runSubsetMutation<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string;
    machineSetId?: string; subsetId?: string;
    requestId?: string; ipAddress?: string;
  },
  mutate: (tx: Prisma.TransactionClient,
    parent: { id: string; machineId: string; isActive: boolean }) => Promise<{
      result: T; action: string; resourceId: string; before: unknown; after: unknown;
    }>,
): Promise<T> {
  if (!centralMachineSubsetSettingsEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (input.machineSetId && !ID.test(input.machineSetId))
    throw new AccessError("invalid_action_resource", 400);
  if (input.subsetId && !ID.test(input.subsetId))
    throw new AccessError("invalid_action_resource", 400);

  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);

    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const stationSelect = {
      active: true, pendingApproval: true,
      allowOperational: true, allowBi: true, allowPriorities: true,
    } as const;
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationSelect,
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralMachineSetSettingsPrivilege(principal);

    const parentId = input.machineSetId ?? (await tx.machineSubset.findUnique({
      where: { id: input.subsetId! }, select: { machineSetId: true },
    }))?.machineSetId;
    if (!parentId) throw new AccessError("asset_not_found", 404);
    const reference = await tx.machineSet.findUnique({
      where: { id: parentId }, select: { machineId: true },
    });
    if (!reference) throw new AccessError("asset_not_found", 404);
    await lockMachineFlow(tx, reference.machineId);
    // Same lock order as set create/edit: machine -> set row -> subset row.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM machine_sets WHERE id = ${parentId} FOR UPDATE
    `);
    const parent = await tx.machineSet.findUnique({
      where: { id: parentId }, select: { id: true, machineId: true, isActive: true },
    });
    if (!parent || parent.machineId !== reference.machineId)
      throw new AccessError("asset_not_found", 404);
    const machine = await tx.machine.findUnique({
      where: { id: parent.machineId }, select: { isActive: true },
    });
    if (!machine?.isActive) throw new AccessError("machine_inactive", 409);

    const latest = await resolveSession(tx, request);
    const currentStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationSelect,
    });
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!currentStation?.active || currentStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, currentStation, "operational");
    assertCentralMachineSetSettingsPrivilege(latest);
    if (!centralMachineSubsetSettingsEnabled())
      throw new AccessError("central_action_not_supported");

    const change = await mutate(tx, parent);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: change.action, resourceType: "machine_subset",
      resourceId: change.resourceId, machineId: parent.machineId,
      before: change.before, after: change.after,
    });
    return change.result;
  }, { timeout: 30_000 });
}

export function createCentralMachineSubset(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; machineSetId: string;
    body: unknown; requestId?: string; ipAddress?: string;
  },
) {
  const patch = parseCentralSubsetBody(input.body, "create");
  return runSubsetMutation(db, input, async (tx, parent) => {
    if (!parent.isActive) throw new AccessError("asset_parent_inactive", 409);
    const type = await tx.machineSubsetType.findUnique({
      where: { id: patch.typeId! }, select: typeSelect,
    });
    if (!type?.isActive) throw new AccessError("asset_type_inactive", 400);
    const duplicate = await tx.machineSubset.findUnique({
      where: { machineSetId_code: { machineSetId: parent.id, code: patch.code! } },
      select: { id: true },
    });
    if (duplicate) throw new AccessError("asset_code_in_use", 409);
    const created = await tx.machineSubset.create({
      data: {
        machineSetId: parent.id,
        code: patch.code!, name: patch.name!, typeId: type.id,
        description: patch.description ?? null, manufacturer: patch.manufacturer ?? null,
        model: patch.model ?? null, assetTag: patch.assetTag ?? null,
        isActive: patch.isActive ?? true, displayOrder: patch.displayOrder ?? null,
      },
      include: { subsetType: { select: typeSelect } },
    });
    return {
      result: created, resourceId: created.id,
      action: "andon.machine_subset.settings.create",
      before: null, after: snapshot(created),
    };
  });
}

export function updateCentralMachineSubset(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; subsetId: string;
    body: unknown; requestId?: string; ipAddress?: string;
  },
) {
  const patch = parseCentralSubsetBody(input.body, "update");
  return runSubsetMutation(db, input, async (tx, parent) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM machine_subsets WHERE id = ${input.subsetId} FOR UPDATE
    `);
    const existing = await tx.machineSubset.findUnique({
      where: { id: input.subsetId },
    });
    if (!existing || existing.machineSetId !== parent.id)
      throw new AccessError("asset_not_found", 404);

    const identityChanged =
      (patch.name !== undefined && patch.name !== existing.name) ||
      (patch.code !== undefined && patch.code !== existing.code) ||
      (patch.typeId !== undefined && patch.typeId !== existing.typeId);
    const deactivating = patch.isActive === false && existing.isActive;
    if (identityChanged || deactivating) {
      const active = await tx.andonCall.findFirst({
        where: {
          OR: [
            { machineSubsetId: existing.id },
            { confirmedMachineSubsetId: existing.id },
          ],
          status: { in: ["open", "in_progress", "post_maintenance"] },
        }, select: { id: true },
      });
      if (active) throw new AccessError("asset_has_active_call", 409);
    }
    if (identityChanged) {
      const history = await tx.andonCall.findFirst({
        where: { OR: [
          { machineSubsetId: existing.id },
          { confirmedMachineSubsetId: existing.id },
        ] }, select: { id: true },
      });
      if (history) throw new AccessError("asset_has_history", 409);
    }
    if (patch.isActive === true && !parent.isActive)
      throw new AccessError("asset_parent_inactive", 409);

    let typeId = existing.typeId;
    if (patch.typeId !== undefined && patch.typeId !== existing.typeId) {
      const type = await tx.machineSubsetType.findUnique({
        where: { id: patch.typeId }, select: typeSelect,
      });
      if (!type?.isActive) throw new AccessError("asset_type_inactive", 400);
      typeId = type.id;
    }
    if (patch.isActive === true && !typeId)
      throw new AccessError("asset_type_inactive", 400);
    if (patch.code !== undefined && patch.code !== existing.code) {
      const duplicate = await tx.machineSubset.findUnique({
        where: {
          machineSetId_code: { machineSetId: parent.id, code: patch.code },
        }, select: { id: true },
      });
      if (duplicate) throw new AccessError("asset_code_in_use", 409);
    }

    const updated = await tx.machineSubset.update({
      where: { id: existing.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.code !== undefined ? { code: patch.code } : {}),
        ...(patch.typeId !== undefined ? { typeId } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.manufacturer !== undefined ? { manufacturer: patch.manufacturer } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.assetTag !== undefined ? { assetTag: patch.assetTag } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        ...(patch.displayOrder !== undefined ? { displayOrder: patch.displayOrder } : {}),
      },
      include: { subsetType: { select: typeSelect } },
    });
    return {
      result: updated, resourceId: existing.id,
      action: "andon.machine_subset.settings.update",
      before: snapshot(existing), after: snapshot(updated),
    };
  });
}
