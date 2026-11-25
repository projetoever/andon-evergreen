import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachinePriorityFlow } from "../db/priorityFlowLock.js";
import {
  buildCurrentPrioritySnapshot, buildPrioritySnapshot, diffPrioritySnapshots,
} from "../domain/machinePriorityHistory.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { AccessError, assertFullMachineScope, assertModule, assertPermission } from "./policy.js";

/** A full global machine order cannot be written by a selected-scope user.
 * Standalone server-only adapter. Caller must first pass HTTPS/Origin/CSRF.
 * This is only called by a reviewed and separately gated route.
 */
export async function runCentralPriorityOrderWrite(
  db: Pick<PrismaClient, "$transaction">,
  input: { token: string; workstationId: string; machineIds: unknown; expectedMachineIds: unknown;
    priorityHighlightCount?: unknown; expectedPriorityHighlightCount?: unknown;
    ipAddress?: string; requestId?: string },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!Array.isArray(input.machineIds) ||
      input.machineIds.length > 1000 ||
      input.machineIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120) ||
      new Set(input.machineIds).size !== input.machineIds.length)
    throw new AccessError("priority_order_invalid", 400);
  const machineIds: string[] = input.machineIds;
  if (!Array.isArray(input.expectedMachineIds) ||
      input.expectedMachineIds.length > 1000 ||
      input.expectedMachineIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120) ||
      new Set(input.expectedMachineIds).size !== input.expectedMachineIds.length)
    throw new AccessError("priority_expected_order_required", 400);
  const expectedMachineIds: string[] = input.expectedMachineIds;
  const isHighlightChange = input.priorityHighlightCount !== undefined;
  if (isHighlightChange &&
      (!Number.isInteger(input.priorityHighlightCount) ||
       Number(input.priorityHighlightCount) < 1 ||
       Number(input.priorityHighlightCount) > 1000 ||
       !Number.isInteger(input.expectedPriorityHighlightCount)))
    throw new AccessError("priority_highlight_count_invalid", 400);
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachinePriorityFlow(tx);

    const principal = await resolveSession(tx, {
      token: input.token, workstationId: input.workstationId,
    });
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { id: true, active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "priorities");
    assertPermission(principal, "priorities.write");
    assertFullMachineScope(principal);

    const current = await tx.machine.findMany({
      select: { id: true, isActive: true, priorityOrder: true, displayOrder: true },
    });
    const currentById = new Map(current.map((m) => [m.id, m]));
    if (current.length !== machineIds.length ||
        machineIds.some((id) => !currentById.has(id)))
      throw new AccessError("priority_machine_catalog_changed", 409);
    const config = await tx.dashboardPriorityConfig.findUnique({
      where: { id: "global" }, select: { priorityHighlightCount: true },
    });
    const previousHighlightCount = config?.priorityHighlightCount ?? 5;
    const activeCount = current.filter((machine) => machine.isActive).length;
    const nextHighlightCount = isHighlightChange
      ? Number(input.priorityHighlightCount) : previousHighlightCount;
    if (isHighlightChange && Number(input.expectedPriorityHighlightCount) !== previousHighlightCount)
      throw new AccessError("priority_highlight_changed", 409);
    if (isHighlightChange && nextHighlightCount > activeCount)
      throw new AccessError("priority_highlight_count_out_of_range", 409);
    const before = buildCurrentPrioritySnapshot(current, previousHighlightCount);
    if (expectedMachineIds.length !== before.orderedIds.length ||
        expectedMachineIds.some((id, index) => id !== before.orderedIds[index]))
      throw new AccessError("priority_order_changed", 409);
    const after = buildPrioritySnapshot(machineIds, currentById, nextHighlightCount);
    const changes = diffPrioritySnapshots(machineIds, before, after);
    const now = new Date();
    for (const [index, id] of machineIds.entries())
      await tx.machine.update({ where: { id }, data: { priorityOrder: index + 1 } });
    for (const change of changes)
      await tx.machinePriorityHistory.create({
        data: {
          ...change, changedAt: now, changedBy: principal.login,
          source: "priority_manager",
        },
      });
    await tx.dashboardPriorityConfig.upsert({
      where: { id: "global" },
      create: {
        id: "global", lastOrderUpdatedAt: now, lastOrderUpdatedBy: principal.login,
        priorityHighlightCount: nextHighlightCount,
      },
      update: { lastOrderUpdatedAt: now, lastOrderUpdatedBy: principal.login,
        ...(isHighlightChange ? { priorityHighlightCount: nextHighlightCount } : {}) },
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(principal),
      ipAddress: input.ipAddress, requestId: input.requestId,
    }, {
      action: "priorities.write", resourceType: "priority_order", resourceId: "global",
      before: { machineIds: before.orderedIds, priorityHighlightCount: previousHighlightCount },
      after: { machineIds: after.orderedIds, priorityHighlightCount: nextHighlightCount, changes },
    });
    return { ok: true as const, lastOrderUpdatedAt: now,
      lastOrderUpdatedBy: principal.login, priorityHighlightCount: nextHighlightCount };
  });
}
