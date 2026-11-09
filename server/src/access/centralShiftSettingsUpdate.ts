import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { AccessError, assertModule } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import {
  centralShiftUpdateEnabled, assertCentralShiftSettingsPrivilege,
} from "../security/centralShiftSettingsHttp.js";

type ShiftPatch = {
  name?: string;
  startTime?: string;
  endTime?: string;
  active?: boolean;
};

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = new Set(["name", "startTime", "endTime", "active"]);

/** Strict allowlist; no shift IDs, employee assignments or attendance fields. */
export function parseCentralShiftPatch(input: unknown): ShiftPatch {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AccessError("invalid_input", 400);
  const body = input as Record<string, unknown>;
  const keys = Object.keys(body);
  if (!keys.length || keys.length > FIELDS.size || keys.some(k => !FIELDS.has(k)))
    throw new AccessError("invalid_input", 400);
  const result: ShiftPatch = {};
  if ("name" in body) {
    if (typeof body.name !== "string" || /[\x00-\x1f\x7f]/.test(body.name))
      throw new AccessError("invalid_input", 400);
    const name = body.name.trim();
    if (!name || [...name].length > 80)
      throw new AccessError("invalid_input", 400);
    result.name = name;
  }
  for (const field of ["startTime", "endTime"] as const) {
    if (field in body) {
      if (typeof body[field] !== "string" || !TIME.test(body[field]))
        throw new AccessError("invalid_input", 400);
      result[field] = body[field];
    }
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean")
      throw new AccessError("invalid_input", 400);
    result.active = body.active;
  }
  return result;
}

/**
 * R12-04B / #368. Configuration of shift display/schedule, never a physical
 * production mode transition. Atomic audit and no live attendance rewrites.
 */
export function updateCentralShift(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; shiftId: string; body: unknown;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!centralShiftUpdateEnabled())
    throw new AccessError("central_action_not_supported");
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input.shiftId))
    throw new AccessError("invalid_action_resource", 400);
  const patch = parseCentralShiftPatch(input.body);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${"andon-shift-catalog"}))::text
    `);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
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
    assertModule(principal, station, "operational");
    assertCentralShiftSettingsPrivilege(principal);

    // Lock precisely the shift being changed; do not lock any machines,
    // change sessions, or rewrite historical technician shift snapshots.
    const existing = await tx.shift.findUnique({ where: { id: input.shiftId } });
    if (!existing) throw new AccessError("shift_not_found", 404);
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM shifts WHERE id = ${input.shiftId} FOR UPDATE
    `);

    const latest = await resolveSession(tx, request);
    const currentStation = await tx.workstation.findUnique({
      where: { id: input.workstationId }, select: stationFields,
    });
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!currentStation?.active || currentStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, currentStation, "operational");
    assertCentralShiftSettingsPrivilege(latest);
    if (!centralShiftUpdateEnabled())
      throw new AccessError("central_action_not_supported");

    // Never silently move time boundaries under an ongoing attendance.
    const activeSession = await tx.technicianSession.findFirst({
      where: { shiftId: input.shiftId, endedAt: null },
      select: { id: true },
    });
    if (activeSession) throw new AccessError("shift_has_active_session", 409);

    if (patch.name) {
      const collision = await tx.shift.findFirst({
        where: {
          name: { equals: patch.name, mode: "insensitive" },
          id: { not: input.shiftId },
        }, select: { id: true },
      });
      if (collision) throw new AccessError("shift_name_in_use", 409);
    }
    const updated = await tx.shift.update({
      where: { id: input.shiftId }, data: patch,
    });
    const snapshot = (s: typeof updated) => ({
      name: s.name, startTime: s.startTime, endTime: s.endTime, active: s.active,
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "andon.shift.settings.update",
      resourceType: "shift", resourceId: input.shiftId,
      before: snapshot(existing), after: snapshot(updated),
    });
    return updated;
  }, { timeout: 30_000 });
}
