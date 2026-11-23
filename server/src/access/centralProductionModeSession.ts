import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission, type Principal } from "./policy.js";
import { lockUser, resolveSession, type AccessRequest } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";

type Mode = "scheduled" | "not_scheduled";
type Input = AccessRequest & {
  machineId: string;
  expectedProductionMode: Mode;
  productionMode: Mode;
  requestId?: string;
  ipAddress?: string;
};

/** An explicit WRITE grant, not the terminal's request-only grant, is required.
 * No password, token or temporary elevation is issued by this path.
 */
export function assertSessionProductionScheduleWrite(principal: Principal, machineId: string) {
  if (principal.accountType !== "person" || principal.purpose !== "normal")
    throw new AccessError("permission_denied");
  assertPermission(principal, "andon.read", machineId);
  assertPermission(principal, "production.schedule.write", machineId);
}

/** Session-authorized changes for users already entitled to WRITE.
 * The older credential-verified path remains unchanged for request-only
 * operators needing a separate approver.
 */
export async function setCentralProductionModeWithSession(
  db: PrismaClient,
  input: Input,
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(input.machineId) ||
      !["scheduled", "not_scheduled"].includes(input.expectedProductionMode) ||
      !["scheduled", "not_scheduled"].includes(input.productionMode) ||
      input.expectedProductionMode === input.productionMode)
    throw new AccessError("invalid_input", 400);

  const principal = await resolveSession(db, input);
  assertSessionProductionScheduleWrite(principal, input.machineId);

  return db.$transaction(async tx => {
    // Revalidate after locks so revocation, scope and permission changes
    // cannot be bypassed by an authorization check preceding the write.
    await lockUser(tx, principal.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachineFlow(tx, input.machineId);

    const latest = await resolveSession(tx, input);
    if (latest.sessionId !== principal.sessionId || latest.userId !== principal.userId)
      throw new AccessError("authentication_required", 401);
    assertSessionProductionScheduleWrite(latest, input.machineId);

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
          durationSeconds: Math.max(0,
            Math.floor((now.getTime() - previousEvent.startedAt.getTime()) / 1000)),
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
      action: "machine.production_mode.session_authorized",
      resourceType: "machine", resourceId: input.machineId, machineId: input.machineId,
      before: { productionMode: machine.productionMode },
      after: {
        productionMode: input.productionMode,
        authorizedByUserId: latest.userId,
        permission: "production.schedule.write",
        operatorSessionUnchanged: true,
      },
    });
    return {
      ok: true, machineId: updated.id,
      productionMode: updated.productionMode, changedAt: now.toISOString(),
    };
  });
}
