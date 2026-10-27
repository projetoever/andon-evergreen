import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal, type AuditActor } from "./audit.js";
import { AccessError, type Principal } from "./policy.js";
import {
  hashAccessPassword,
  normalizeLogin,
  temporaryPassword,
  tokenHash,
  validatePersonalPassword,
  verifyAccessPassword,
} from "./credentials.js";

const HOUR = 60 * 60 * 1000;
const IDLE = 30 * 60 * 1000;
type Reader = Pick<Prisma.TransactionClient, "accessSession">;
export type AccessRequest = { token: string; workstationId: string };
export async function resolveSession(
  db: Reader,
  request: AccessRequest,
  now = new Date(),
): Promise<Principal> {
  if (!/^[a-f0-9]{64}$/.test(request.token)) throw new AccessError("authentication_required", 401);
  const row = await db.accessSession.findUnique({
    where: { tokenHash: tokenHash(request.token) },
    include: { user: { include: { permissions: true, machines: true } }, workstation: true },
  });
  if (
    !row ||
    row.revokedAt ||
    row.expiresAt <= now ||
    !row.user.active ||
    row.authorizationVersion !== row.user.authorizationVersion ||
    row.workstationId !== request.workstationId ||
    row.lastInteractionAt.getTime() + IDLE <= now.getTime()
  )
    throw new AccessError("authentication_required", 401);
  if (!row.workstation.active || row.workstation.pendingApproval)
    throw new AccessError("workstation_denied");
  if (row.user.mustChangePassword && row.purpose !== "password_change")
    throw new AccessError("password_change_required");
  return {
    userId: row.user.id,
    login: row.user.login,
    displayName: row.user.displayName,
    roleLabel: row.user.roleLabel,
    accountType: row.user.accountType,
    isPrimaryAdmin: row.user.isPrimaryAdmin,
    machineScope: row.user.machineScope,
    machineIds: row.user.machines.map((x) => x.machineId),
    permissions: row.user.permissions.map((x) => x.key),
    sessionId: row.id,
    workstationId: row.workstationId,
    purpose: row.purpose,
    authenticatedAt: row.createdAt,
  };
}
export async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`andon-access:${id}`}))::text`;
}
export async function issueSession(
  tx: Prisma.TransactionClient,
  user: { id: string; authorizationVersion: number },
  workstationId: string,
  purpose: "normal" | "password_change",
  now: Date,
) {
  const token = randomBytes(32).toString("hex");
  const row = await tx.accessSession.create({
    data: {
      tokenHash: tokenHash(token),
      userId: user.id,
      workstationId,
      purpose,
      authorizationVersion: user.authorizationVersion,
      createdAt: now,
      lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + (purpose === "normal" ? 12 * HOUR : 10 * 60 * 1000)),
    },
  });
  return { token, sessionId: row.id, expiresAt: row.expiresAt, purpose };
}
export async function login(
  db: PrismaClient,
  input: { login: string; password: string; workstationId: string },
  context: Pick<AuditActor, "ipAddress" | "requestId"> = {},
) {
  let normalized: string;
  try {
    normalized = normalizeLogin(input.login);
  } catch {
    normalized = "";
  }
  const user = normalized ? await db.accessUser.findUnique({ where: { login: normalized } }) : null;
  const validInput = [...input.password].length <= 128;
  // A full-cost dummy verification avoids the cheap unknown-user path.
  const dummy = `andon-scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
  const verified =
    validInput && (await verifyAccessPassword(input.password, user?.passwordHash ?? dummy));
  const denied = async () => {
    await appendAudit(
      db,
      { actorType: "legacy_unidentified", workstationId: input.workstationId, ...context },
      {
        action: "access.login",
        resourceType: "access",
        result: "denied",
        reason: "invalid_credentials",
      },
    );
    throw new AccessError("invalid_credentials", 401);
  };
  if (!user || !verified || !user.active || user.accountType !== "person") return denied();
  const result = await db.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const current = await tx.accessUser.findUniqueOrThrow({ where: { id: user.id } });
    const station = await tx.workstation.findUnique({ where: { id: input.workstationId } });
    const now = new Date();
    if (
      !current.active ||
      current.passwordHash !== user.passwordHash ||
      !station?.active ||
      station.pendingApproval ||
      (current.mustChangePassword &&
        (!current.temporaryExpiresAt ||
          current.temporaryExpiresAt <= now ||
          current.temporaryConsumedAt))
    )
      return null;
    const effective = current.mustChangePassword
      ? await tx.accessUser.update({
          where: { id: current.id },
          data: { temporaryConsumedAt: now, authorizationVersion: { increment: 1 } },
        })
      : current;
    const session = await issueSession(
      tx,
      effective,
      station.id,
      current.mustChangePassword ? "password_change" : "normal",
      now,
    );
    await appendAudit(
      tx,
      {
        actorType: "user",
        actorUserId: current.id,
        actorLogin: current.login,
        actorName: current.displayName,
        actorRole: current.roleLabel,
        workstationId: station.id,
        sessionId: session.sessionId,
        ...context,
      },
      {
        action: "access.login",
        resourceType: "access_user",
        resourceId: current.id,
        after: { purpose: session.purpose },
      },
    );
    return session;
  });
  return result ?? denied();
}
export async function changePassword(
  db: PrismaClient,
  request: AccessRequest,
  newPassword: string,
  currentPassword?: string,
) {
  validatePersonalPassword(newPassword);
  const initial = await resolveSession(db, request);
  const credential = await db.accessUser.findUniqueOrThrow({ where: { id: initial.userId } });
  if (
    initial.purpose === "normal" &&
    (!currentPassword || !(await verifyAccessPassword(currentPassword, credential.passwordHash)))
  ) {
    throw new AccessError("current_password_required", 401);
  }
  const passwordHash = await hashAccessPassword(newPassword);
  return db.$transaction(async (tx) => {
    await lockUser(tx, initial.userId);
    const principal = await resolveSession(tx, request);
    const current = await tx.accessUser.findUniqueOrThrow({ where: { id: principal.userId } });
    if (current.passwordHash !== credential.passwordHash)
      throw new AccessError("authentication_required", 401);
    const now = new Date();
    const user = await tx.accessUser.update({
      where: { id: principal.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        temporaryExpiresAt: null,
        temporaryConsumedAt: null,
        authorizationVersion: { increment: 1 },
      },
    });
    await tx.accessSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    const session = await issueSession(tx, user, request.workstationId, "normal", now);
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.password.changed",
      resourceType: "access_user",
      resourceId: user.id,
    });
    return session;
  });
}
export async function revokeUserSessions(
  db: PrismaClient,
  request: AccessRequest,
  userId: string,
  reason: string,
) {
  if (!reason.trim()) throw new AccessError("reason_required", 400);
  return db.$transaction(async (tx) => {
    // Consistent lock ordering for administrator/target operations.
    const initial = await resolveSession(tx, request);
    for (const id of [...new Set([initial.userId, userId])].sort()) await lockUser(tx, id);
    const principal = await resolveSession(tx, request);
    assertRecentAdmin(principal);
    const user = await tx.accessUser.update({
      where: { id: userId },
      data: { authorizationVersion: { increment: 1 } },
    });
    await tx.accessSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.sessions.revoked",
      resourceType: "access_user",
      resourceId: userId,
      reason,
      after: { version: user.authorizationVersion },
    });
  });
}
export async function logout(db: PrismaClient, request: AccessRequest) {
  return db.$transaction(async (tx) => {
    const principal = await resolveSession(tx, request);
    await tx.accessSession.update({
      where: { id: principal.sessionId },
      data: { revokedAt: new Date() },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.logout",
      resourceType: "access_session",
      resourceId: principal.sessionId,
    });
  });
}
// Called only for explicit user interaction by the future HTTP adapter, never polling.
export async function recordInteraction(db: PrismaClient, request: AccessRequest) {
  const principal = await resolveSession(db, request);
  await db.accessSession.update({
    where: { id: principal.sessionId },
    data: { lastInteractionAt: new Date() },
  });
}
function assertRecentAdmin(principal: Principal) {
  if (!principal.isPrimaryAdmin || principal.purpose !== "normal")
    throw new AccessError("admin_required");
  if (Date.now() - principal.authenticatedAt.getTime() > 5 * 60 * 1000)
    throw new AccessError("reauthentication_required", 401);
}
export async function resetPassword(
  db: PrismaClient,
  request: AccessRequest,
  userId: string,
  reason: string,
) {
  if (!reason.trim()) throw new AccessError("reason_required", 400);
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  const password = temporaryPassword();
  const passwordHash = await hashAccessPassword(password);
  await db.$transaction(async (tx) => {
    for (const id of [...new Set([initial.userId, userId])].sort()) await lockUser(tx, id);
    const principal = await resolveSession(tx, request);
    assertRecentAdmin(principal);
    const target = await tx.accessUser.findUniqueOrThrow({ where: { id: userId } });
    if (target.isPrimaryAdmin) throw new AccessError("use_admin_recovery");
    const now = new Date();
    await tx.accessUser.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        temporaryExpiresAt: new Date(now.getTime() + 24 * HOUR),
        temporaryConsumedAt: null,
        authorizationVersion: { increment: 1 },
      },
    });
    await tx.accessSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "access.password.reset",
      resourceType: "access_user",
      resourceId: userId,
      reason,
    });
  });
  return { temporaryPassword: password };
}
