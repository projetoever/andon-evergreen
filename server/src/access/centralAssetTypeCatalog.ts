import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { assertCentralMachineSetSettingsPrivilege } from "../security/centralMachineSetSettingsHttp.js";
import { centralAssetTypeCatalogEnabled } from "../security/centralAssetTypeCatalogHttp.js";

export type AssetCatalogKind = "set" | "subset";
type TypePatch = {
  code?: string; name?: string; description?: string | null;
  isActive?: boolean; displayOrder?: number;
};
const FIELDS = new Set(["code", "name", "description", "isActive", "displayOrder"]);
const ID = /^[A-Za-z0-9_-]{1,160}$/;

function validText(input: unknown, limit: number) {
  if (typeof input !== "string" || /[\x00-\x1f\x7f]/.test(input))
    throw new AccessError("invalid_input", 400);
  const value = input.trim();
  if (!value || [...value].length > limit)
    throw new AccessError("invalid_input", 400);
  return value;
}
function validCode(input: unknown) {
  const code = validText(input, 120).toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!code || code.length > 80)
    throw new AccessError("invalid_input", 400);
  return code;
}
export function parseCentralAssetTypePatch(body: unknown, operation: "create" | "update"): TypePatch {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const src = body as Record<string, unknown>;
  const keys = Object.keys(src);
  if (!keys.length || keys.some(key => !FIELDS.has(key)))
    throw new AccessError("invalid_input", 400);
  const patch: TypePatch = {};
  if ("name" in src) patch.name = validText(src.name, 100);
  if ("code" in src) patch.code = validCode(src.code);
  if ("description" in src) {
    if (src.description === null || src.description === "")
      patch.description = null;
    else if (typeof src.description !== "string" ||
        /[\x00-\x1f\x7f]/.test(src.description) ||
        [...src.description].length > 1000)
      throw new AccessError("invalid_input", 400);
    else patch.description = src.description.trim() || null;
  }
  if ("isActive" in src) {
    if (typeof src.isActive !== "boolean") throw new AccessError("invalid_input", 400);
    patch.isActive = src.isActive;
  }
  if ("displayOrder" in src) {
    if (typeof src.displayOrder !== "number" || !Number.isInteger(src.displayOrder) ||
        src.displayOrder < 0 || src.displayOrder > 9999)
      throw new AccessError("invalid_input", 400);
    patch.displayOrder = src.displayOrder;
  }
  if (operation === "create") {
    if (!patch.name) throw new AccessError("invalid_input", 400);
    patch.code ??= validCode(patch.name);
  }
  return patch;
}
type TypeRow = {
  id: string; code: string; name: string; description: string | null;
  isActive: boolean; displayOrder: number; createdAt: Date; updatedAt: Date;
};
function snapshot(row: TypeRow) {
  return {
    id: row.id, code: row.code, name: row.name, description: row.description,
    isActive: row.isActive, displayOrder: row.displayOrder,
  };
}
function serialize(row: TypeRow) {
  return { ...row, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString() };
}
type BaseInput = {
  token: string; workstationId: string; kind: AssetCatalogKind;
  requestId?: string; ipAddress?: string;
};
async function runTypeTransaction<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: BaseInput,
  modify: (tx: Prisma.TransactionClient) => Promise<{
    result: T; id: string; action: string; before: unknown; after: unknown;
  }>,
): Promise<T> {
  if (!centralAssetTypeCatalogEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (input.kind !== "set" && input.kind !== "subset")
    throw new AccessError("invalid_input", 400);
  return db.$transaction(async tx => {
    const auth = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!auth) throw new AccessError("authentication_required", 401);
    await lockUser(tx, auth.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${"andon-asset-types-" + input.kind}))::text
    `);
    const request = { token: input.token, workstationId: input.workstationId };
    const initial = await resolveSession(tx, request);
    if (initial.userId !== auth.userId)
      throw new AccessError("authentication_required", 401);
    const fields = {
      active: true, pendingApproval: true,
      allowOperational: true, allowBi: true, allowPriorities: true,
    } as const;
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: fields,
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(initial, station, "operational");
    assertCentralMachineSetSettingsPrivilege(initial);

    const latest = await resolveSession(tx, request);
    const fresh = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: fields,
    });
    if (latest.userId !== initial.userId || latest.sessionId !== initial.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!fresh?.active || fresh.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, fresh, "operational");
    assertCentralMachineSetSettingsPrivilege(latest);
    if (!centralAssetTypeCatalogEnabled())
      throw new AccessError("central_action_not_supported");

    const change = await modify(tx);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: change.action, resourceType: input.kind === "set" ?
        "machine_set_type" : "machine_subset_type",
      resourceId: change.id,
      before: change.before, after: change.after,
    });
    return change.result;
  }, { timeout: 30_000 });
}

export function createCentralAssetType(
  db: Pick<PrismaClient, "$transaction">,
  input: BaseInput & { body: unknown },
) {
  const patch = parseCentralAssetTypePatch(input.body, "create");
  const data = {
    name: patch.name!, code: patch.code!, description: patch.description ?? null,
    isActive: patch.isActive ?? true, displayOrder: patch.displayOrder ?? 0,
  };
  return runTypeTransaction(db, input, async tx => {
    const existing = input.kind === "set"
      ? await tx.machineSetType.findUnique({ where: { code: data.code }, select: { id: true } })
      : await tx.machineSubsetType.findUnique({ where: { code: data.code }, select: { id: true } });
    if (existing) throw new AccessError("asset_type_code_in_use", 409);
    const created = input.kind === "set"
      ? await tx.machineSetType.create({ data })
      : await tx.machineSubsetType.create({ data });
    return {
      result: serialize(created), id: created.id,
      action: input.kind === "set" ? "andon.machine_set_type.settings.create" :
        "andon.machine_subset_type.settings.create",
      before: null, after: snapshot(created),
    };
  });
}

export function updateCentralAssetType(
  db: Pick<PrismaClient, "$transaction">,
  input: BaseInput & { typeId: string; body: unknown },
) {
  if (!ID.test(input.typeId)) throw new AccessError("invalid_action_resource", 400);
  const patch = parseCentralAssetTypePatch(input.body, "update");
  return runTypeTransaction(db, input, async tx => {
    // Only constant table names from the enum are used, never raw user values.
    if (input.kind === "set") {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM machine_set_types
        WHERE id = ${input.typeId} FOR UPDATE`);
    } else {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM machine_subset_types
        WHERE id = ${input.typeId} FOR UPDATE`);
    }
    const original = input.kind === "set"
      ? await tx.machineSetType.findUnique({ where: { id: input.typeId } })
      : await tx.machineSubsetType.findUnique({ where: { id: input.typeId } });
    if (!original) throw new AccessError("asset_type_not_found", 404);
    const identityChanged = (patch.code !== undefined && patch.code !== original.code) ||
      (patch.name !== undefined && patch.name !== original.name);
    const deactivate = patch.isActive === false && original.isActive;

    if (identityChanged || deactivate) {
      const inUse = input.kind === "set" ?
        await tx.machineSet.findFirst({
          where: { typeId: input.typeId, ...(deactivate && !identityChanged ? { isActive: true } : {}) },
          select: { id: true },
        }) :
        await tx.machineSubset.findFirst({
          where: { typeId: input.typeId, ...(deactivate && !identityChanged ? { isActive: true } : {}) },
          select: { id: true },
        });
      if (inUse) throw new AccessError(identityChanged ?
        "asset_type_in_use" : "asset_type_active_asset", 409);
    }
    if (patch.code && patch.code !== original.code) {
      const collision = input.kind === "set" ?
        await tx.machineSetType.findUnique({ where: { code: patch.code }, select: { id: true } }) :
        await tx.machineSubsetType.findUnique({ where: { code: patch.code }, select: { id: true } });
      if (collision) throw new AccessError("asset_type_code_in_use", 409);
    }
    const updated = input.kind === "set" ?
      await tx.machineSetType.update({ where: { id: input.typeId }, data: patch }) :
      await tx.machineSubsetType.update({ where: { id: input.typeId }, data: patch });
    return {
      result: serialize(updated), id: input.typeId,
      action: input.kind === "set" ? "andon.machine_set_type.settings.update" :
        "andon.machine_subset_type.settings.update",
      before: snapshot(original), after: snapshot(updated),
    };
  });
}
