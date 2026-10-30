import type { PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertModule, assertPermission } from "./policy.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

type PreferenceChange =
  | { type: "screen-lock"; machineId: string | null }
  | { type: "machine-sound"; machineId: string; enabled: boolean };

export function runCentralOwnWorkstationPreference(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string;
    workstationId: string;
    targetWorkstationId: string;
    change: PreferenceChange;
    requestId?: string;
    ipAddress?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId) ||
      parseWorkstationId(input.workstationId) !== parseWorkstationId(input.targetWorkstationId))
    throw new AccessError("workstation_scope_denied");
  const machineId = input.change.machineId;
  if (machineId !== null && !/^[a-zA-Z0-9_-]{1,160}$/.test(machineId))
    throw new AccessError("invalid_input", 400);
  if (input.change.type === "machine-sound" &&
      typeof input.change.enabled !== "boolean")
    throw new AccessError("invalid_input", 400);

  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    // This order also synchronizes with deactivation and central logout:
    // user -> own workstation -> machine (when selected).
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId ||
        principal.workstationId !== input.targetWorkstationId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
        lockedMachineId: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");

    if (machineId) {
      if (principal.machineScope !== "all" && !principal.machineIds.includes(machineId))
        throw new AccessError("machine_scope_denied");
      await lockMachineFlow(tx, machineId);
    }
    // Re-evaluate the current session and station after all required locks.
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const fresh = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
        lockedMachineId: true },
    });
    if (!fresh?.active || fresh.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, fresh, "operational");
    if (machineId)
      assertPermission(latest, "andon.read", machineId);

    if (machineId) {
      const machine = await tx.machine.findUnique({
        where: { id: machineId },
        select: { id: true, isActive: true },
      });
      if (!machine?.isActive) throw new AccessError("machine_inactive", 409);
    }

    if (input.change.type === "screen-lock") {
      const previous = fresh.lockedMachineId;
      if (previous !== machineId) {
        await tx.workstation.update({
          where: { id: input.workstationId },
          data: { lockedMachineId: machineId },
        });
        await appendAudit(tx, {
          ...actorFromPrincipal(latest), requestId: input.requestId,
          ipAddress: input.ipAddress,
        }, {
          action: "workstation.screen.lock",
          resourceType: "workstation", resourceId: input.workstationId,
          machineId: machineId ?? previous,
          before: { lockedMachineId: previous },
          after: { lockedMachineId: machineId },
        });
      }
      return { workstationId: input.workstationId, lockedMachineId: machineId };
    }

    const before = await tx.workstationMachineSoundPreference.findUnique({
      where: { workstationId_machineId: {
        workstationId: input.workstationId, machineId: input.change.machineId,
      } },
      select: { enabled: true, updatedAt: true },
    });
    if (before?.enabled === input.change.enabled)
      return { workstationId: input.workstationId,
        machineId: input.change.machineId,
        enabled: before.enabled, updatedAt: before.updatedAt };
    const preference = await tx.workstationMachineSoundPreference.upsert({
      where: { workstationId_machineId: {
        workstationId: input.workstationId, machineId: input.change.machineId,
      } },
      create: { workstationId: input.workstationId,
        machineId: input.change.machineId, enabled: input.change.enabled },
      update: { enabled: input.change.enabled },
      select: { machineId: true, enabled: true, updatedAt: true },
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: "workstation.sound.preference",
      resourceType: "workstation", resourceId: input.workstationId,
      machineId: input.change.machineId,
      before: { enabled: before?.enabled ?? null },
      after: { enabled: preference.enabled },
    });
    return { workstationId: input.workstationId, ...preference };
  });
}
