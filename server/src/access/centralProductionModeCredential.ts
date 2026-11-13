import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission, type Principal } from "./policy.js";
import { normalizeLogin, verifyAccessPassword } from "./credentials.js";
import { lockUser, resolveSession, type AccessRequest } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";

type Mode = "scheduled" | "not_scheduled";
type Verifier = {
  active: boolean;
  accountType: string;
  mustChangePassword: boolean;
  isPrimaryAdmin: boolean;
  machineScope: string;
  permissions: { key: string }[];
  machines: { machineId: string }[];
};

/** Terminal grant requests a *credential-verified* change; it cannot write by itself.
 * Existing non-persistent accounts with production.schedule.write remain supported.
 * One-shot approval needs a separately authenticated human with write permission.
 */
export function assertScheduleRequestPermission(principal: Principal, machineId: string) {
  assertPermission(principal, "andon.read", machineId);
  const key = principal.permissions.includes("production.schedule.request")
    ? "production.schedule.request" : "production.schedule.write";
  assertPermission(principal, key, machineId);
}

export function mayApproveProductionMode(user: Verifier, machineId: string) {
  if (!user.active || user.accountType !== "person" || user.mustChangePassword) return false;
  if (user.isPrimaryAdmin) return user.machineScope === "all";
  return user.permissions.some(p => p.key === "andon.read") &&
    user.permissions.some(p => p.key === "production.schedule.write") &&
    (user.machineScope === "all" || user.machines.some(m => m.machineId === machineId));
}

/** A single audited transaction is the only central path changing production
 * schedule. The normal /api/machines/:id/production-mode PATCH remains blocked
 * in central mode; no temporary grant, token or altered user session is issued.
 */
export async function setCentralProductionModeWithCredential(
  db: PrismaClient,
  input: AccessRequest & {
    machineId: string;
    expectedProductionMode: Mode;
    productionMode: Mode;
    login: string;
    password: string;
    requestId?: string;
    ipAddress?: string;
  },
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(input.machineId) ||
      !["scheduled", "not_scheduled"].includes(input.expectedProductionMode) ||
      !["scheduled", "not_scheduled"].includes(input.productionMode) ||
      input.expectedProductionMode === input.productionMode ||
      !input.login || !input.password || [...input.password].length > 128)
    throw new AccessError("invalid_input", 400);

  const principal = await resolveSession(db, input);
  assertScheduleRequestPermission(principal, input.machineId);

  let normalized = "";
  try { normalized = normalizeLogin(input.login); } catch { /* uniform failure */ }
  const candidate = normalized ? await db.accessUser.findUnique({
    where: { login: normalized }, include: { permissions: true, machines: true },
  }) : null;
  // Always perform password hash verification, including missing users.
  const dummy = `andon-scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;
  const verified = await verifyAccessPassword(input.password, candidate?.passwordHash ?? dummy);
  if (!candidate || !verified || !mayApproveProductionMode(candidate, input.machineId))
    throw new AccessError("invalid_credentials", 401);

  return db.$transaction(async tx => {
    // Locks include both humans, preventing password/role changes during proof.
    for (const id of [...new Set([principal.userId, candidate.id])].sort())
      await lockUser(tx, id);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachineFlow(tx, input.machineId);

    const latest = await resolveSession(tx, input);
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    assertScheduleRequestPermission(latest, input.machineId);

    const account = await tx.accessUser.findUnique({
      where: { id: candidate.id },
      include: { permissions: true, machines: true },
    });
    if (!account || account.passwordHash !== candidate.passwordHash ||
        !mayApproveProductionMode(account, input.machineId))
      throw new AccessError("invalid_credentials", 401);

    const workstation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true, allowOperational: true,
        allowBi: true, allowPriorities: true, lockedMachineId: true },
    });
    if (!workstation?.active || workstation.pendingApproval)
      throw new AccessError("workstation_denied");
    assertModule(latest, workstation, "operational");
    if (workstation.lockedMachineId && workstation.lockedMachineId !== input.machineId)
      throw new AccessError("machine_scope_denied");

    const machine = await tx.machine.findUnique({
      where: { id: input.machineId },
      select: { id: true, isActive: true, productionMode: true },
    });
    if (!machine || !machine.isActive) throw new AccessError("machine_not_found", 404);
    if (machine.productionMode !== input.expectedProductionMode)
      throw new AccessError("production_mode_changed", 409);

    const now = new Date();
    const previousEvent = await tx.machineProductionEvent.findFirst({
      where: { machineId: input.machineId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    if (previousEvent) {
      await tx.machineProductionEvent.update({
        where: { id: previousEvent.id },
        data: {
          endedAt: now,
          durationSeconds: Math.max(0, Math.floor((now.getTime() - previousEvent.startedAt.getTime()) / 1000)),
        },
      });
    }
    await tx.machineProductionEvent.create({
      data: { machineId: input.machineId, productionMode: input.productionMode, startedAt: now },
    });
    const updated = await tx.machine.update({
      where: { id: input.machineId },
      data: { productionMode: input.productionMode },
      select: { id: true, productionMode: true },
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId, ipAddress: input.ipAddress,
    }, {
      action: "machine.production_mode.credential_verified",
      resourceType: "machine", resourceId: input.machineId, machineId: input.machineId,
      before: { productionMode: machine.productionMode },
      after: { productionMode: input.productionMode,
        verifiedByUserId: account.id, verifiedByRole: account.roleLabel,
        operatorSessionUnchanged: true },
    });
    return { ok: true, machineId: updated.id,
      productionMode: updated.productionMode, changedAt: now.toISOString() };
  });
}
