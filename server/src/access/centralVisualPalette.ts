import { Prisma, type PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule } from "./policy.js";
import { assertCentralOperationalSettingsPrivilege } from "../security/centralOperationalSettingsHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { GLOBAL_SYSTEM_SETTINGS_ID } from "../services/systemSettings.js";
import {
  parseStoredVisualPalette,
  publicVisualPalette,
  publicVisualPaletteRevision,
} from "../services/andonVisualPalette.js";

/**
 * Never accept HTML/CSS, arbitrary hex, status tokens, or generic settings.
 * A save requires the previously-read revision so competing Admins do not
 * silently overwrite each other's choices.
 */
export function parseCentralVisualPaletteUpdate(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new AccessError("invalid_input", 400);
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(body, "palette") ||
      !Object.prototype.hasOwnProperty.call(body, "expectedRevision"))
    throw new AccessError("invalid_input", 400);
  const palette = parseStoredVisualPalette(body.palette);
  const revision = body.expectedRevision;
  if (!palette || typeof revision !== "number" ||
      !Number.isSafeInteger(revision) || revision < 0 ||
      revision >= Number.MAX_SAFE_INTEGER)
    throw new AccessError("invalid_input", 400);
  return { palette, expectedRevision: revision };
}

export function runCentralVisualPaletteUpdate(
  db: Pick<PrismaClient, "$transaction">,
  input: { token: string; workstationId: string; body: unknown;
    requestId?: string; ipAddress?: string },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  const { palette, expectedRevision } = parseCentralVisualPaletteUpdate(input.body);
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
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralOperationalSettingsPrivilege(principal);

    await tx.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      update: {}, create: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    });
    await tx.$queryRaw`SELECT id FROM system_settings WHERE id = ${GLOBAL_SYSTEM_SETTINGS_ID} FOR UPDATE`;
    const latest = await resolveSession(tx, request);
    const fresh = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    if (!fresh?.active || fresh.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, fresh, "operational");
    assertCentralOperationalSettingsPrivilege(latest);

    const before = await tx.systemSettings.findUniqueOrThrow({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      select: { andonVisualPalette: true, andonVisualPaletteRevision: true },
    });
    if (before.andonVisualPaletteRevision !== expectedRevision)
      throw new AccessError("palette_revision_conflict", 409);
    const previousPalette = publicVisualPalette(before.andonVisualPalette);
    const changed = JSON.stringify(previousPalette) !== JSON.stringify(palette);
    if (!changed) return {
      palette: previousPalette,
      revision: publicVisualPaletteRevision(before.andonVisualPaletteRevision),
      changed: false,
    };

    const after = await tx.systemSettings.update({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      data: {
        andonVisualPalette: palette as unknown as Prisma.InputJsonValue,
        andonVisualPaletteRevision: { increment: 1 },
      },
      select: { andonVisualPalette: true, andonVisualPaletteRevision: true },
    });
    const result = {
      palette: publicVisualPalette(after.andonVisualPalette),
      revision: publicVisualPaletteRevision(after.andonVisualPaletteRevision),
      changed: true,
    };
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      ipAddress: input.ipAddress,
      requestId: input.requestId,
    }, {
      action: "andon.visual_palette.updated",
      resourceType: "system_settings",
      resourceId: GLOBAL_SYSTEM_SETTINGS_ID,
      before: { palette: previousPalette, revision: before.andonVisualPaletteRevision },
      after: { palette: result.palette, revision: result.revision },
    });
    return result;
  });
}
