import type { Prisma, PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, isPermission } from "./policy.js";
import {
  hashAccessPassword,
  normalizeLogin,
  temporaryPassword,
  validatePersonalPassword,
} from "./credentials.js";
import { resolveSession, lockUser, issueSession, type AccessRequest } from "./sessions.js";
import { verifyAdminPassword } from "../routes/adminAuth.js";

export const ROLES = ["Admin", "Gestor/Gerente", "Líder", "Manutenção", "Produção"] as const;
export const userSelect = {
  id: true,
  login: true,
  displayName: true,
  roleLabel: true,
  accountType: true,
  active: true,
  isPrimaryAdmin: true,
  machineScope: true,
  mustChangePassword: true,
  authorizationVersion: true,
  permissions: { select: { key: true } },
  machines: { select: { machineId: true } },
} satisfies Prisma.AccessUserSelect;
export type UserInput = {
  login: string;
  displayName: string;
  roleLabel: string;
  accountType: "person" | "kiosk";
  active: boolean;
  machineScope: "all" | "selected";
  permissions: string[];
  machineIds: string[];
  version?: number;
};
export async function requireUserAdmin(
  db: Pick<Prisma.TransactionClient, "accessSession">,
  request: AccessRequest,
) {
  const principal = await resolveSession(db, request);
  if (!principal.isPrimaryAdmin || principal.purpose !== "normal")
    throw new AccessError("admin_required");
  return principal;
}
export function validateUser(input: UserInput) {
  input.login = normalizeLogin(input.login);
  input.displayName = input.displayName.trim();
  if (
    !input.displayName ||
    !ROLES.includes(input.roleLabel as (typeof ROLES)[number]) ||
    input.permissions.some((p) => !isPermission(p)) ||
    new Set(input.permissions).size !== input.permissions.length ||
    new Set(input.machineIds).size !== input.machineIds.length ||
    (input.machineScope === "all" && input.machineIds.length) ||
    (input.accountType === "kiosk" && input.active)
  )
    throw new AccessError("invalid_user", 400);
}
export async function saveUser(
  db: PrismaClient,
  request: AccessRequest,
  input: UserInput,
  id?: string,
) {
  validateUser(input);
  const initial = await requireUserAdmin(db, request);
  const password = id || input.accountType === "kiosk" ? null : temporaryPassword();
  const passwordHash = id ? undefined : await hashAccessPassword(password ?? temporaryPassword());
  return db.$transaction(async (tx) => {
    for (const key of [...new Set([initial.userId, ...(id ? [id] : [])])].sort())
      await lockUser(tx, key);
    const principal = await requireUserAdmin(tx, request);
    const before = id
      ? await tx.accessUser.findUnique({ where: { id }, select: userSelect })
      : null;
    if (id && !before) throw new AccessError("user_not_found", 404);
    if (before?.isPrimaryAdmin) throw new AccessError("primary_admin_protected");
    if (
      before &&
      (before.authorizationVersion !== input.version || before.accountType !== input.accountType)
    )
      throw new AccessError("user_conflict", 409);
    const count = await tx.machine.count({ where: { id: { in: input.machineIds } } });
    if (count !== input.machineIds.length) throw new AccessError("invalid_machine_scope", 400);
    const data = {
      login: input.login,
      displayName: input.displayName,
      roleLabel: input.roleLabel,
      accountType: input.accountType,
      active: input.active,
      machineScope: input.machineScope,
    };
    const user = id
      ? await tx.accessUser.update({
          where: { id },
          data: {
            ...data,
            authorizationVersion: { increment: 1 },
            permissions: { deleteMany: {}, create: input.permissions.map((key) => ({ key })) },
            machines: {
              deleteMany: {},
              create: input.machineIds.map((machineId) => ({ machineId })),
            },
          },
          select: userSelect,
        })
      : await tx.accessUser.create({
          data: {
            ...data,
            passwordHash: passwordHash!,
            mustChangePassword: true,
            temporaryExpiresAt: password ? new Date(Date.now() + 86400000) : null,
            permissions: { create: input.permissions.map((key) => ({ key })) },
            machines: { create: input.machineIds.map((machineId) => ({ machineId })) },
          },
          select: userSelect,
        });
    if (id)
      await tx.accessSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: !before
        ? "access.user.created"
        : before.active && !user.active
          ? "access.user.deactivated"
          : "access.user.updated",
      resourceType: "access_user",
      resourceId: user.id,
      before,
      after: user,
    });
    return { user, ...(password ? { temporaryPassword: password } : {}) };
  });
}
// Explicit one-time enrollment using the already configured legacy Admin credential.
// Neither defaults nor existing module credentials are changed by this operation.
export async function initializeUserAdmin(
  db: PrismaClient,
  workstationId: string,
  loginName: string,
  currentPassword: string,
  newPassword: string,
) {
  const adminLogin = normalizeLogin(loginName);
  validatePersonalPassword(newPassword);
  const settings = await db.systemSettings.findUnique({ where: { id: "global" } });
  if (!(await verifyAdminPassword(currentPassword)))
    throw new AccessError("invalid_credentials", 401);
  // The two authentication paths coexist during the controlled migration.
  // Reusing the legacy secret would weaken that separation.
  if (newPassword === currentPassword)
    throw new AccessError("password_reuse_denied", 400);
  const passwordHash = await hashAccessPassword(newPassword);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('andon-access:initialize'))::text`;
    await tx.$queryRaw`SELECT id FROM system_settings WHERE id = 'global' FOR UPDATE`;
    const latest = await tx.systemSettings.findUnique({ where: { id: "global" } });
    if ((latest?.adminPasswordHash ?? null) !== (settings?.adminPasswordHash ?? null))
      throw new AccessError("invalid_credentials", 401);
    if (await tx.accessUser.findFirst({ where: { isPrimaryAdmin: true } }))
      throw new AccessError("already_initialized", 409);
    const station = await tx.workstation.findUnique({ where: { id: workstationId } });
    if (!station?.active || station.pendingApproval) throw new AccessError("workstation_denied");
    const user = await tx.accessUser.create({
      data: {
        login: adminLogin,
        displayName: "Admin",
        roleLabel: "Admin",
        isPrimaryAdmin: true,
        machineScope: "all",
        passwordHash,
        mustChangePassword: false,
      },
    });
    const session = await issueSession(tx, user, workstationId, "normal", new Date());
    await appendAudit(
      tx,
      { actorType: "legacy_admin", actorLogin: adminLogin, workstationId },
      {
        action: "access.admin.initialized",
        resourceType: "access_user",
        resourceId: user.id,
      },
    );
    return session;
  });
}
