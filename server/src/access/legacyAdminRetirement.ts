import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError } from "./policy.js";
import { centralAccessEnabled } from "./http.js";
import { assertRecentAdmin, lockUser, resolveSession, type AccessRequest } from "./sessions.js";

/**
 * A legacy Admin secret is not a second human login in central mode.
 * It can only be retired after the primary human Admin has provisioned a
 * separate offline central recovery code. Read-only status never returns hashes.
 */
export async function legacyAdminRetirementStatus(db: PrismaClient, request: AccessRequest) {
  if (!centralAccessEnabled()) throw new AccessError("central_mode_required");
  const principal = await resolveSession(db, request);
  if (!principal.isPrimaryAdmin || principal.purpose !== "normal" ||
      principal.accountType !== "person")
    throw new AccessError("admin_required");
  const [legacy, central] = await Promise.all([
    db.systemSettings.findUnique({
      where: { id: "global" }, select: { adminPasswordHash: true },
    }),
    db.accessUser.findUnique({
      where: { id: principal.userId },
      select: { adminRecoveryCodeHash: true },
    }),
  ]);
  return {
    legacyPasswordPresent: Boolean(legacy?.adminPasswordHash),
    centralRecoveryConfigured: Boolean(central?.adminRecoveryCodeHash),
  };
}

/**
 * Opt-in credential retirement. Never triggered by logging in or changing
 * passwords. Requires a recent step-up, offline central recovery readiness
 * and a primary Admin session; preserves all operational data and sessions.
 *
 * Warning: reverting to central OFF requires a separate local-only legacy
 * bootstrap, and cannot silently revive the previous global credential.
 */
export async function retireLegacyAdminPassword(
  db: PrismaClient, request: AccessRequest, confirmed: boolean,
) {
  if (!centralAccessEnabled()) throw new AccessError("central_mode_required");
  if (confirmed !== true) throw new AccessError("retirement_confirmation_required", 400);
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  if (initial.accountType !== "person")
    throw new AccessError("admin_required");
  return db.$transaction(async (tx) => {
    await lockUser(tx, initial.userId);
    await tx.$queryRaw`SELECT id FROM system_settings WHERE id = 'global' FOR UPDATE`;
    const principal = await resolveSession(tx, request);
    if (principal.userId !== initial.userId || principal.sessionId !== initial.sessionId ||
        principal.accountType !== "person")
      throw new AccessError("authentication_required", 401);
    assertRecentAdmin(principal);

    const [global, admin] = await Promise.all([
      tx.systemSettings.findUnique({
        where: { id: "global" },
        select: {
          adminPasswordHash: true,
          adminRecoveryCodeHash: true,
          adminRecoveryCodeIssuedAt: true,
        },
      }),
      tx.accessUser.findUnique({
        where: { id: principal.userId },
        select: { isPrimaryAdmin: true, active: true, accountType: true, adminRecoveryCodeHash: true },
      }),
    ]);
    if (!admin?.isPrimaryAdmin || !admin.active || admin.accountType !== "person")
      throw new AccessError("admin_required");
    if (!admin.adminRecoveryCodeHash)
      throw new AccessError("central_recovery_required", 409);
    if (!global?.adminPasswordHash)
      throw new AccessError("legacy_admin_already_retired", 409);
    const updated = await tx.systemSettings.updateMany({
      where: { id: "global", adminPasswordHash: global.adminPasswordHash },
      data: {
        adminPasswordHash: null,
        adminRecoveryCodeHash: null,
        adminRecoveryCodeIssuedAt: null,
      },
    });
    if (updated.count !== 1)
      throw new AccessError("legacy_admin_already_retired", 409);
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.admin.legacy_credential.retired",
      resourceType: "system_settings",
      resourceId: "global",
      before: {
        legacyPasswordConfigured: true,
        legacyRecoveryConfigured: Boolean(global.adminRecoveryCodeHash),
      },
      after: {
        legacyPasswordConfigured: false,
        legacyRecoveryConfigured: false,
        centralRecoveryConfigured: true,
      },
    });
    return { ok: true, legacyPasswordPresent: false };
  });
}
