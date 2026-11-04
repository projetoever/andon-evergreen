import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal, type AuditActor } from "./audit.js";
import { hashAccessPassword, validatePersonalPassword, verifyAccessPassword } from "./credentials.js";
import { AccessError } from "./policy.js";
import { assertRecentAdmin, lockUser, resolveSession, type AccessRequest } from "./sessions.js";

function compactCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const clean = value.toUpperCase().replace(/[\s-]/g, "");
  const raw = clean.startsWith("HUB") ? clean.slice(3) : clean;
  return /^[A-F0-9]{32}$/.test(raw) ? raw : null;
}

export function formatCentralRecoveryCode(raw: string): string {
  if (!/^[A-F0-9]{32}$/.test(raw)) throw new Error("invalid_recovery_code");
  return "HUB-" + raw.match(/.{4}/g)!.join("-");
}

/**
 * Issue an offline recovery code only to the primary Admin in a recently
 * verified, approved central session. Returning a replacement invalidates
 * any previous code. No plaintext secret is retained in the database.
 */
export async function issueCentralAdminRecoveryCode(
  db: PrismaClient,
  request: AccessRequest,
) {
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  const raw = randomBytes(16).toString("hex").toUpperCase(); // 128 bits
  const hash = await hashAccessPassword(raw);
  const issuedAt = new Date();
  await db.$transaction(async (tx) => {
    await lockUser(tx, initial.userId);
    const principal = await resolveSession(tx, request);
    if (principal.userId !== initial.userId ||
        principal.sessionId !== initial.sessionId)
      throw new AccessError("authentication_required", 401);
    assertRecentAdmin(principal);
    const saved = await tx.accessUser.updateMany({
      where: {
        id: principal.userId,
        isPrimaryAdmin: true,
        accountType: "person",
        active: true,
      },
      data: {
        adminRecoveryCodeHash: hash,
        adminRecoveryCodeIssuedAt: issuedAt,
      },
    });
    if (saved.count !== 1) throw new AccessError("admin_required");
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.admin.recovery_code.issued",
      resourceType: "access_user",
      resourceId: principal.userId,
    });
  });
  return { recoveryCode: formatCentralRecoveryCode(raw), issuedAt };
}

/**
 * Physical/local-only central password recovery. The HTTP route enforces real
 * loopback transport, exact allowed Origin, HTTPS, preauth CSRF and throttling
 * BEFORE this function. No session is minted by recovery.
 */
export async function recoverCentralAdmin(
  db: PrismaClient,
  input: { recoveryCode: unknown; newPassword: string },
  audit: Pick<AuditActor, "ipAddress" | "requestId" | "workstationId"> = {},
) {
  const code = compactCode(input.recoveryCode);
  if (!code) throw new AccessError("invalid_recovery_code", 401);
  validatePersonalPassword(input.newPassword);
  const newHash = await hashAccessPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    const primary = await tx.accessUser.findFirst({
      where: { isPrimaryAdmin: true },
      select: { id: true },
    });
    if (!primary) throw new AccessError("invalid_recovery_code", 401);
    await lockUser(tx, primary.id);
    const current = await tx.accessUser.findUnique({
      where: { id: primary.id },
      select: {
        id: true, isPrimaryAdmin: true, active: true, accountType: true,
        passwordHash: true, adminRecoveryCodeHash: true,
      },
    });
    if (!current || !current.isPrimaryAdmin || !current.active ||
        current.accountType !== "person" || !current.adminRecoveryCodeHash ||
        !(await verifyAccessPassword(code, current.adminRecoveryCodeHash)))
      throw new AccessError("invalid_recovery_code", 401);
    if (await verifyAccessPassword(input.newPassword, current.passwordHash))
      throw new AccessError("password_reuse_denied", 400);
    const changed = await tx.accessUser.updateMany({
      where: {
        id: current.id,
        isPrimaryAdmin: true,
        active: true,
        adminRecoveryCodeHash: current.adminRecoveryCodeHash,
        passwordHash: current.passwordHash,
      },
      data: {
        passwordHash: newHash,
        adminRecoveryCodeHash: null,
        adminRecoveryCodeIssuedAt: null,
        authorizationVersion: { increment: 1 },
        mustChangePassword: false,
        temporaryExpiresAt: null,
        temporaryConsumedAt: null,
      },
    });
    if (changed.count !== 1) throw new AccessError("invalid_recovery_code", 401);
    await tx.accessSession.updateMany({
      where: { userId: current.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await appendAudit(tx, { actorType: "legacy_unidentified", ...audit }, {
      action: "access.admin.password.recovered",
      resourceType: "access_user",
      resourceId: current.id,
      reason: "local_one_time_code",
    });
  });
  return { ok: true };
}
