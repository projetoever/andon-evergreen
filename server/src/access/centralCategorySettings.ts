import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockAndonCategoryFlow } from "../db/andonCategoryFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import {
  assertCentralCategorySettingsPrivilege, centralCategorySettingsEnabled,
} from "../security/centralCategorySettingsHttp.js";

const CATEGORY_GROUPS = new Set(["maintenance", "production"]);
const CATEGORY_ID = /^[a-z0-9_]{2,40}$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const LIVE_STATUSES = ["open", "in_progress", "post_maintenance"];
const PATCH_FIELDS = new Set(["displayName", "categoryGroup", "color", "active", "displayOrder"]);
const CREATE_FIELDS = new Set([...PATCH_FIELDS, "id"]);
type CategoryPatch = {
  displayName?: string; categoryGroup?: string; color?: string;
  active?: boolean; displayOrder?: number;
};
type CategoryCreate = CategoryPatch & {
  id: string; displayName: string; categoryGroup: string; color: string;
  active: boolean; displayOrder: number;
};

function cleanName(value: unknown) {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
    throw new AccessError("invalid_input", 400);
  const name = value.trim();
  if (!name || [...name].length > 60)
    throw new AccessError("invalid_input", 400);
  return name;
}
function objectBody(body: unknown, allowed: ReadonlySet<string>) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !allowed.has(key)))
    throw new AccessError("invalid_input", 400);
  return input;
}
function parseFields(body: Record<string, unknown>): CategoryPatch {
  const patch: CategoryPatch = {};
  if ("displayName" in body) patch.displayName = cleanName(body.displayName);
  if ("categoryGroup" in body) {
    if (typeof body.categoryGroup !== "string" ||
        !CATEGORY_GROUPS.has(body.categoryGroup))
      throw new AccessError("invalid_category_group", 400);
    patch.categoryGroup = body.categoryGroup;
  }
  if ("color" in body) {
    if (typeof body.color !== "string" || !COLOR.test(body.color))
      throw new AccessError("invalid_color", 400);
    patch.color = body.color.toUpperCase();
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean")
      throw new AccessError("invalid_input", 400);
    patch.active = body.active;
  }
  if ("displayOrder" in body) {
    if (typeof body.displayOrder !== "number" ||
        !Number.isInteger(body.displayOrder) ||
        body.displayOrder < 0 || body.displayOrder > 9999)
      throw new AccessError("invalid_display_order", 400);
    patch.displayOrder = body.displayOrder;
  }
  return patch;
}
export function parseCentralCategoryCreate(body: unknown): CategoryCreate {
  const input = objectBody(body, CREATE_FIELDS);
  if (typeof input.id !== "string" || !CATEGORY_ID.test(input.id))
    throw new AccessError("invalid_category_id", 400);
  const parsed = parseFields(input);
  if (!parsed.displayName || !parsed.categoryGroup || !parsed.color)
    throw new AccessError("invalid_input", 400);
  return {
    id: input.id,
    displayName: parsed.displayName,
    categoryGroup: parsed.categoryGroup,
    color: parsed.color,
    active: parsed.active ?? true,
    displayOrder: parsed.displayOrder ?? 0,
  };
}
export function parseCentralCategoryPatch(body: unknown): CategoryPatch {
  return parseFields(objectBody(body, PATCH_FIELDS));
}
function snapshot(category: {
  id: string; displayName: string; categoryGroup: string;
  color: string; active: boolean; displayOrder: number;
}) {
  return {
    id: category.id, displayName: category.displayName,
    categoryGroup: category.categoryGroup, color: category.color,
    active: category.active, displayOrder: category.displayOrder,
  };
}
async function authorizedCategoryMutation<T>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; categoryId: string;
    requestId?: string; ipAddress?: string;
  },
  mutate: (tx: Prisma.TransactionClient) => Promise<{
    result: T; before: unknown; after: unknown; action: string;
  }>,
) {
  if (!centralCategorySettingsEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (!CATEGORY_ID.test(input.categoryId))
    throw new AccessError("invalid_category_id", 400);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockAndonCategoryFlow(tx, input.categoryId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
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
    assertModule(principal, station, "operational");
    assertCentralCategorySettingsPrivilege(principal);
    const latest = await resolveSession(tx, request);
    const currentStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: fields,
    });
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    if (!currentStation?.active || currentStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, currentStation, "operational");
    assertCentralCategorySettingsPrivilege(latest);
    if (!centralCategorySettingsEnabled())
      throw new AccessError("central_action_not_supported");

    const change = await mutate(tx);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: change.action,
      resourceType: "andon_category",
      resourceId: input.categoryId,
      before: change.before,
      after: change.after,
    });
    return change.result;
  }, { timeout: 30_000 });
}

/** Create a new category, not a maintenance call or physical machine state. */
export async function createCentralCategory(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; body: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  const body = parseCentralCategoryCreate(input.body);
  return authorizedCategoryMutation(db, {
    ...input, categoryId: body.id,
  }, async tx => {
    const existing = await tx.andonCategory.findUnique({
      where: { id: body.id }, select: { id: true },
    });
    if (existing) throw new AccessError("category_already_exists", 409);
    const created = await tx.andonCategory.create({ data: body });
    return {
      result: created, before: null, after: snapshot(created),
      action: "andon.category.settings.create",
    };
  });
}

/** Change category presentation/availability while protecting KPI history. */
export async function updateCentralCategory(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; categoryId: string;
    body: unknown; requestId?: string; ipAddress?: string;
  },
) {
  const patch = parseCentralCategoryPatch(input.body);
  return authorizedCategoryMutation(db, input, async tx => {
    // Row lock serializes edits with other SQL mutations, category advisory
    // lock aligns with the existing legacy in-call category operation.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM andon_categories WHERE id = ${input.categoryId} FOR UPDATE
    `);
    const existing = await tx.andonCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!existing) throw new AccessError("category_not_found", 404);

    const groupChanged = patch.categoryGroup !== undefined &&
      patch.categoryGroup !== existing.categoryGroup;
    const deactivate = patch.active === false && existing.active;
    if (groupChanged || deactivate) {
      const active = await tx.andonCall.findFirst({
        where: {
          subtype: input.categoryId,
          isSystemTest: false,
          status: { in: LIVE_STATUSES },
        },
        select: { id: true },
      });
      if (active) throw new AccessError("category_has_active_call", 409);
    }
    if (groupChanged) {
      // Historical calls identify the technical area by ID. Re-grouping one
      // could silently reinterpret earlier maintenance KPIs. Refuse it.
      const history = await tx.andonCall.findFirst({
        where: { subtype: input.categoryId },
        select: { id: true },
      });
      if (history) throw new AccessError("category_has_history", 409);
      const [legacyTech, techAreas, reasonOptions] = await Promise.all([
        tx.technician.count({ where: { technicalArea: input.categoryId } }),
        tx.technicianTechnicalArea.count({ where: { technicalArea: input.categoryId } }),
        tx.callReasonOption.count({ where: { technicalAreaId: input.categoryId } }),
      ]);
      if (legacyTech + techAreas + reasonOptions > 0)
        throw new AccessError("category_in_use", 409);
    }

    const updated = await tx.andonCategory.update({
      where: { id: input.categoryId }, data: patch,
    });
    return {
      result: updated,
      before: snapshot(existing),
      after: snapshot(updated),
      action: "andon.category.settings.update",
    };
  });
}
