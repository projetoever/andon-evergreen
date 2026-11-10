import { Prisma, type PrismaClient } from "@prisma/client";
import { AccessError, assertModule } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { assertCentralTechnicianCatalogPrivilege } from "../security/centralTechnicianCatalogHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import {
  hashCredential, normalizePin, normalizeTag,
} from "../security/technicianCredentials.js";
import {
  lockTechnicianCredential, credentialBelongsToAnotherTechnician,
  technicianIdentitySelect, toPublicTechnician,
} from "../services/technicianIdentity.js";

type TechnicianCreateBody = {
  name: string; employeeId: string;
  technicalAreas: string[]; shiftId: string;
  active: boolean; pin: string; tag: string | null;
};

function plainText(value: unknown, max: number): string {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value))
    throw new AccessError("invalid_input", 400);
  const text = value.trim();
  if (!text || [...text].length > max)
    throw new AccessError("invalid_input", 400);
  return text;
}

/** No arbitrary credential hashes, labels or historical attendance fields. */
export function parseCentralTechnicianCreateBody(body: unknown): TechnicianCreateBody {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(k => ![
    "name", "employeeId", "technicalArea", "technicalAreas",
    "shiftId", "active", "pin", "tag",
  ].includes(k))) throw new AccessError("invalid_input", 400);

  const name = plainText(b.name, 120);
  const employeeId = plainText(b.employeeId, 80).replace(/\s+/g, " ");
  const shiftId = plainText(b.shiftId, 160);
  const providedArea = b.technicalArea === undefined
    ? null : plainText(b.technicalArea, 160);
  const areas = b.technicalAreas === undefined
    ? (providedArea ? [providedArea] : [])
    : Array.isArray(b.technicalAreas) ? b.technicalAreas.map(area => plainText(area, 160)) : [];
  if (areas.length < 1 || areas.length > 12 ||
      new Set(areas.map(area => area.toLocaleLowerCase("pt-BR"))).size !== areas.length ||
      (providedArea && !areas.includes(providedArea)))
    throw new AccessError("invalid_technical_areas", 400);
  if (b.active !== undefined && typeof b.active !== "boolean")
    throw new AccessError("invalid_input", 400);
  const pin = normalizePin(b.pin);
  if (!pin) throw new AccessError("invalid_technician_credential", 400);
  const tag = b.tag === undefined || b.tag === null || b.tag === ""
    ? null : normalizeTag(b.tag);
  if (b.tag !== undefined && b.tag !== null && b.tag !== "" && !tag)
    throw new AccessError("invalid_technician_credential", 400);
  return {
    name, employeeId, technicalAreas: areas, shiftId,
    active: b.active !== false, pin, tag,
  };
}

/**
 * New technician identity only, with no modification of existing credentials,
 * attendance sessions, calls, or historical KPI attribution.
 * Secret input and hashes MUST NOT be copied to the audit payload.
 */
export async function createCentralTechnician(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; body: unknown;
    ipAddress?: string; requestId?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  const body = parseCentralTechnicianCreateBody(input.body);
  // Salted hashes are calculated before locks; never persist raw PIN/RFID.
  const [pinHash, tagHash] = await Promise.all([
    hashCredential(body.pin),
    body.tag ? hashCredential(body.tag) : Promise.resolve(null),
  ]);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    // Serializes case-insensitive name/employee ID uniqueness for central
    // enrollments; PIN/tag use their existing per-credential advisory locks.
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${"andon-technician-catalog"}))::text
    `);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralTechnicianCatalogPrivilege(principal);
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralTechnicianCatalogPrivilege(latest);

    const shift = await tx.shift.findUnique({
      where: { id: body.shiftId }, select: { id: true, active: true },
    });
    if (!shift?.active) throw new AccessError("invalid_shift", 400);
    const categories = await tx.andonCategory.findMany({
      where: { id: { in: body.technicalAreas } },
      select: { id: true, categoryGroup: true, active: true },
    });
    if (categories.length !== body.technicalAreas.length ||
        categories.some(category => !category.active || category.categoryGroup !== "maintenance"))
      throw new AccessError("invalid_technical_areas", 400);
    const [duplicateName, duplicateEmployeeId] = await Promise.all([
      tx.technician.findFirst({
        where: { name: { equals: body.name, mode: "insensitive" } },
        select: { id: true },
      }),
      tx.technician.findFirst({
        where: { employeeId: { equals: body.employeeId, mode: "insensitive" } },
        select: { id: true },
      }),
    ]);
    if (duplicateName) throw new AccessError("technician_name_in_use", 409);
    if (duplicateEmployeeId) throw new AccessError("technician_employee_id_in_use", 409);
    await lockTechnicianCredential(tx, { method: "pin", value: body.pin });
    if (body.tag)
      await lockTechnicianCredential(tx, { method: "rfid", value: body.tag });
    if (await credentialBelongsToAnotherTechnician({
      method: "pin", value: body.pin,
    }, undefined, tx)) throw new AccessError("technician_credential_in_use", 409);
    if (body.tag && await credentialBelongsToAnotherTechnician({
      method: "rfid", value: body.tag,
    }, undefined, tx)) throw new AccessError("technician_credential_in_use", 409);

    const created = await tx.technician.create({
      data: {
        name: body.name, employeeId: body.employeeId,
        technicalArea: body.technicalAreas[0], technicalAreas: {
          create: body.technicalAreas.map(technicalArea => ({ technicalArea })),
        },
        shiftId: body.shiftId, active: body.active, pinHash, tagHash,
      },
      select: technicianIdentitySelect,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: "andon.technician.catalog.create",
      resourceType: "technician", resourceId: created.id,
      before: null,
      after: {
        employeeId: created.employeeId, name: created.name,
        technicalAreas: body.technicalAreas, shiftId: created.shiftId,
        active: created.active, hasPin: Boolean(created.pinHash),
        hasTag: Boolean(created.tagHash),
      },
    });
    return toPublicTechnician(created);
  }, { timeout: 30_000 });
}
