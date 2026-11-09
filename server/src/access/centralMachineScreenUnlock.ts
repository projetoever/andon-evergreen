import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertPermission } from "./policy.js";
import { normalizeLogin, verifyAccessPassword } from "./credentials.js";
import { lockUser, resolveSession, type AccessRequest } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";

/** One-time credential proof; never elevates the signed-in operator. */
export function mayAuthorizeScreenUnlock(
  user: {
    active: boolean; accountType: string; mustChangePassword: boolean;
    isPrimaryAdmin: boolean; roleLabel: string; machineScope: string;
    permissions: { key: string }[]; machines: { machineId: string }[];
  },
  machineId: string,
) {
  return user.active && user.accountType === "person" && !user.mustChangePassword &&
    (
      (user.isPrimaryAdmin && user.machineScope === "all") ||
      (user.permissions.some(p => p.key === "andon.read") &&
        (user.machineScope === "all" ||
          user.machines.some(m => m.machineId === machineId)) &&
        // Preserve existing authorized maintenance path. The additional
        // permission is explicit (never implied by role or module access)
        // and uses the SAME one-time password, locks and atomic audit.
        ((user.roleLabel === "Manutenção" &&
          user.permissions.some(p => p.key === "calls.attend")) ||
          user.permissions.some(p => p.key === "workstations.screen.unlock")))
    );
}

export async function unlockCentralMachineScreen(
  db: PrismaClient,
  input: AccessRequest & {
    login: string; password: string; machineId: string;
    requestId?: string; ipAddress?: string;
  },
) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input.machineId))
    throw new AccessError("invalid_input", 400);
  let normalized: string;
  try { normalized = normalizeLogin(input.login); }
  catch { normalized = ""; }

  // Verify outside the transaction. Recheck the same credential hash after
  // locking so a concurrent password change revokes this authorization.
  const candidate = normalized
    ? await db.accessUser.findUnique({
        where: { login: normalized },
        include: { permissions: true, machines: true },
      })
    : null;
  const dummy = `andon-scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
  const verified = [...input.password].length <= 128 &&
    await verifyAccessPassword(input.password, candidate?.passwordHash ?? dummy);
  const principal = await resolveSession(db, input);
  assertPermission(principal, "andon.read", input.machineId);
  if (!candidate || !verified || !mayAuthorizeScreenUnlock(candidate, input.machineId))
    throw new AccessError("invalid_credentials", 401);

  return db.$transaction(async tx => {
    // Lock humans in deterministic order before workstation and machine.
    for (const id of [...new Set([principal.userId, candidate.id])].sort())
      await lockUser(tx, id);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachineFlow(tx, input.machineId);

    const latest = await resolveSession(tx, input);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    assertPermission(latest, "andon.read", input.machineId);
    const account = await tx.accessUser.findUnique({
      where: { id: candidate.id },
      include: { permissions: true, machines: true },
    });
    if (!account || account.passwordHash !== candidate.passwordHash ||
        !mayAuthorizeScreenUnlock(account, input.machineId))
      throw new AccessError("invalid_credentials", 401);

    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true, lockedMachineId: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_denied");
    if (station.lockedMachineId !== input.machineId)
      throw new AccessError("screen_lock_changed", 409);

    const changed = await tx.workstation.updateMany({
      where: { id: input.workstationId, lockedMachineId: input.machineId },
      data: { lockedMachineId: null },
    });
    if (changed.count !== 1) throw new AccessError("screen_lock_changed", 409);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: "workstation.screen.unlock.credential_verified",
      resourceType: "workstation",
      resourceId: input.workstationId,
      machineId: input.machineId,
      reason: "Credencial operacional verificada no desbloqueio de tela fixa",
      before: { lockedMachineId: input.machineId },
      after: {
        lockedMachineId: null,
        verifiedByUserId: account.id,
        verifiedByRole: account.roleLabel,
        operatorSessionUnchanged: true,
      },
    });
    return { workstationId: input.workstationId, lockedMachineId: null, ok: true };
  });
}
