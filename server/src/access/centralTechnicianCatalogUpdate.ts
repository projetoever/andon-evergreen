import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockTechnicianSessionFlow } from "../db/technicianSessionFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { assertCentralTechnicianCatalogPrivilege } from "../security/centralTechnicianCatalogHttp.js";
import { centralTechnicianUpdateEnabled } from "../security/centralTechnicianCatalogUpdateHttp.js";
import {
  credentialBelongsToAnotherTechnician, getTechnicianTechnicalAreas,
  lockTechnicianCredential, technicianIdentitySelect, toPublicTechnician,
} from "../services/technicianIdentity.js";
import { hashCredential, normalizePin, normalizeTag } from "../security/technicianCredentials.js";

type TechnicianUpdate = {
  name?: string;
  employeeId?: string;
  technicalAreas?: string[];
  shiftId?: string;
  active?: boolean;
  pin?: string;
  tag?: string | null;
};

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
    throw new AccessError("invalid_input", 400);
  const trimmed = value.trim();
  if (!trimmed || [...trimmed].length > max)
    throw new AccessError("invalid_input", 400);
  return trimmed;
}

const FIELDS = new Set([
  "name", "employeeId", "technicalArea", "technicalAreas",
  "shiftId", "active", "pin", "tag",
]);

/** Strict allowlist; input never accepts IDs, hashes or attendance state. */
export function parseCentralTechnicianUpdateBody(raw: unknown): TechnicianUpdate {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AccessError("invalid_input", 400);
  const b = raw as Record<string, unknown>;
  const keys = Object.keys(b);
  if (!keys.length || keys.length > FIELDS.size || keys.some(k => !FIELDS.has(k)))
    throw new AccessError("invalid_input", 400);
  const p: TechnicianUpdate = {};
  if ("name" in b) p.name = cleanText(b.name, 120);
  if ("employeeId" in b) p.employeeId = cleanText(b.employeeId, 80).replace(/\s+/g, " ");
  if ("shiftId" in b) p.shiftId = cleanText(b.shiftId, 160);
  if ("active" in b) {
    if (typeof b.active !== "boolean") throw new AccessError("invalid_input", 400);
    p.active = b.active;
  }
  const area = "technicalArea" in b ? cleanText(b.technicalArea, 160) : undefined;
  if ("technicalAreas" in b) {
    if (!Array.isArray(b.technicalAreas))
      throw new AccessError("invalid_technical_areas", 400);
    p.technicalAreas = b.technicalAreas.map(v => cleanText(v, 160));
    if (area && !p.technicalAreas.includes(area))
      throw new AccessError("invalid_technical_areas", 400);
  } else if (area) p.technicalAreas = [area];
  if (p.technicalAreas && (p.technicalAreas.length < 1 || p.technicalAreas.length > 12 ||
      new Set(p.technicalAreas.map(a => a.toLocaleLowerCase("pt-BR"))).size !==
        p.technicalAreas.length))
    throw new AccessError("invalid_technical_areas", 400);

  if ("pin" in b) {
    const pin = normalizePin(b.pin);
    if (!pin) throw new AccessError("invalid_technician_credential", 400);
    p.pin = pin;
  }
  if ("tag" in b) {
    if (b.tag === "" || b.tag === null) p.tag = null;
    else {
      const tag = normalizeTag(b.tag);
      if (!tag) throw new AccessError("invalid_technician_credential", 400);
      p.tag = tag;
    }
  }
  return p;
}

function safeSnapshot(t: {
  name: string; employeeId: string | null; shiftId: string | null;
  active: boolean; pinHash: string | null; tagHash: string | null;
  technicalArea: string | null; technicalAreas: Array<{ technicalArea: string }>;
}) {
  const areas = getTechnicianTechnicalAreas(t);
  return {
    name: t.name, employeeId: t.employeeId, shiftId: t.shiftId,
    active: t.active, technicalAreas: areas,
    hasPin: Boolean(t.pinHash), hasTag: Boolean(t.tagHash),
  };
}

/**
 * #368 / R12-04A: edit a technician catalog record, not past attendances.
 * Locks: human Hub user -> workstation -> global technician catalog ->
 * technician session lock -> optional PIN then RFID credential locks.
 * The mutation, technical-area rows and sanitized audit are all in one tx.
 */
export async function updateCentralTechnician(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; technicianId: string;
    body: unknown; ipAddress?: string; requestId?: string;
  },
) {
  if (!centralTechnicianUpdateEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input.technicianId))
    throw new AccessError("invalid_action_resource", 400);
  const body = parseCentralTechnicianUpdateBody(input.body);
  const pinHash = body.pin ? await hashCredential(body.pin) : undefined;
  const tagHash = body.tag ? await hashCredential(body.tag) : undefined;

  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${"andon-technician-catalog"}))::text
    `);

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
    assertCentralTechnicianCatalogPrivilege(principal);

    await lockTechnicianSessionFlow(tx, input.technicianId);

    const latest = await resolveSession(tx, request);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationSelect,
    });
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralTechnicianCatalogPrivilege(latest);
    if (!centralTechnicianUpdateEnabled())
      throw new AccessError("central_action_not_supported");

    const current = await tx.technician.findUnique({
      where: { id: input.technicianId }, select: technicianIdentitySelect,
    });
    if (!current) throw new AccessError("technician_not_found", 404);
    if (!current.pinHash && !body.pin)
      throw new AccessError("invalid_technician_credential", 400);

    // Prevent renaming, deactivation or credential rotation while an existing
    // maintenance/follow-up session is running; preserve identity snapshots
    // and the technician's ability to end their current session.
    const assigned = await tx.technicianSession.findFirst({
      where: {
        endedAt: null,
        OR: [
          { technicianId: current.id },
          { technicianId: null, technicianName: { equals: current.name, mode: "insensitive" } },
        ],
      }, select: { id: true },
    });
    if (assigned) throw new AccessError("technician_has_active_session", 409);

    if (body.shiftId) {
      const shift = await tx.shift.findUnique({
        where: { id: body.shiftId }, select: { active: true },
      });
      if (!shift?.active) throw new AccessError("invalid_shift", 400);
    }

    const existing = new Set(getTechnicianTechnicalAreas(current));
    if (body.technicalAreas) {
      const categories = await tx.andonCategory.findMany({
        where: { id: { in: body.technicalAreas } },
        select: { id: true, categoryGroup: true, active: true },
      });
      if (categories.length !== body.technicalAreas.length ||
          categories.some(c => c.categoryGroup !== "maintenance" ||
            (!c.active && !existing.has(c.id))))
        throw new AccessError("invalid_technical_areas", 400);
    }

    if (body.name) {
      const duplicate = await tx.technician.findFirst({
        where: { name: { equals: body.name, mode: "insensitive" },
          id: { not: current.id } }, select: { id: true },
      });
      if (duplicate) throw new AccessError("technician_name_in_use", 409);
    }
    if (body.employeeId) {
      const duplicate = await tx.technician.findFirst({
        where: { employeeId: { equals: body.employeeId, mode: "insensitive" },
          id: { not: current.id } }, select: { id: true },
      });
      if (duplicate) throw new AccessError("technician_employee_id_in_use", 409);
    }

    if (body.pin) await lockTechnicianCredential(tx, { method: "pin", value: body.pin });
    if (body.tag) await lockTechnicianCredential(tx, { method: "rfid", value: body.tag });
    if (body.pin && await credentialBelongsToAnotherTechnician(
      { method: "pin", value: body.pin }, current.id, tx,
    )) throw new AccessError("technician_credential_in_use", 409);
    if (body.tag && await credentialBelongsToAnotherTechnician(
      { method: "rfid", value: body.tag }, current.id, tx,
    )) throw new AccessError("technician_credential_in_use", 409);

    const before = safeSnapshot(current);
    const result = await tx.technician.update({
      where: { id: current.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.employeeId !== undefined ? { employeeId: body.employeeId } : {}),
        ...(body.shiftId !== undefined ? { shiftId: body.shiftId } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.technicalAreas !== undefined ? {
          technicalArea: current.technicalArea && body.technicalAreas.includes(current.technicalArea)
            ? current.technicalArea : body.technicalAreas[0],
          technicalAreas: {
            deleteMany: {},
            create: body.technicalAreas.map(technicalArea => ({ technicalArea })),
          },
        } : {}),
        ...(pinHash !== undefined ? { pinHash } : {}),
        ...("tag" in body ? { tagHash: body.tag === null ? null : tagHash } : {}),
      },
      select: technicianIdentitySelect,
    });
    const after = safeSnapshot(result);
    // The audit does not contain credential hashes, PINs or tag values.
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: "andon.technician.catalog.update",
      resourceType: "technician", resourceId: current.id,
      before,
      after: {
        ...after,
        pinRotated: body.pin !== undefined,
        tagChanged: "tag" in body,
      },
    });
    return toPublicTechnician(result);
  }, { timeout: 30_000 });
}
