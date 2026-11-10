import type { PrismaClient } from "@prisma/client";
import { AccessError, assertModule } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachinePriorityFlow } from "../db/priorityFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { assertCentralMachineSettingsPrivilege } from "../security/centralMachineSettingsHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

export type CentralMachineCreateBody = {
  id: string; name: string; productionMode: "scheduled" | "not_scheduled";
  requireWorkOrderAtOpen: boolean;
};

/** Strict catalog-only allowlist: no status, activation, manual priority or GPIO. */
export function parseCentralMachineCreateBody(body: unknown): CentralMachineCreateBody {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const values = body as Record<string, unknown>;
  const fields = Object.keys(values);
  if (!fields.includes("id") ||
      fields.some(key => !["id", "name", "productionMode", "requireWorkOrderAtOpen"].includes(key)))
    throw new AccessError("invalid_input", 400);
  if (typeof values.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(values.id))
    throw new AccessError("invalid_input", 400);
  const id = values.id;
  if ("name" in values &&
      (typeof values.name !== "string" || /[\x00-\x1f\x7f]/.test(values.name)))
    throw new AccessError("invalid_input", 400);
  const name = "name" in values ? (values.name as string).trim() : `Máquina ${id}`;
  if (!name || [...name].length > 120)
    throw new AccessError("invalid_input", 400);
  const requestedMode = values.productionMode ?? "scheduled";
  if (!["scheduled", "not_scheduled", "production"].includes(String(requestedMode)) ||
      typeof requestedMode !== "string")
    throw new AccessError("invalid_input", 400);
  const productionMode = requestedMode === "not_scheduled" ? "not_scheduled" : "scheduled";
  if ("requireWorkOrderAtOpen" in values && typeof values.requireWorkOrderAtOpen !== "boolean")
    throw new AccessError("invalid_input", 400);
  return {
    id, name, productionMode,
    requireWorkOrderAtOpen: values.requireWorkOrderAtOpen === true,
  };
}

/**
 * Atomic creation: validate credential twice under locks, serialize priority
 * allocation, create machine + production baseline + priority history + audit.
 * An audit error rolls back the whole new machine.
 */
export async function createCentralMachine(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; body: unknown;
    ipAddress?: string; requestId?: string;
  },
): Promise<{ id: string }> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  const body = parseCentralMachineCreateBody(input.body);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachinePriorityFlow(tx);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralMachineSettingsPrivilege(principal);
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true,
      },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralMachineSettingsPrivilege(latest);

    const [highest, activeCount, totalCount] = await Promise.all([
      tx.machine.aggregate({
        _max: { priorityOrder: true, displayOrder: true },
      }),
      tx.machine.count({ where: { isActive: true } }),
      tx.machine.count(),
    ]);
    const priorityOrder = Math.max(
      highest._max.priorityOrder ?? 0,
      highest._max.displayOrder ?? 0,
    ) + 1;
    if (!Number.isSafeInteger(priorityOrder) || priorityOrder > 2147483647)
      throw new AccessError("machine_priority_exhausted", 409);
    const number = Number(body.id);
    const displayOrder = /^\d+$/.test(body.id) &&
      Number.isSafeInteger(number) && number >= 0 && number <= 2147483647
      ? number : undefined;
    const createdAt = new Date();
    const machine = await tx.machine.create({
      data: {
        id: body.id, name: body.name, productionMode: body.productionMode,
        requireWorkOrderAtOpen: body.requireWorkOrderAtOpen,
        displayOrder, priorityOrder, machineStatus: "running",
        andonStatus: "normal", currentCallId: null, isActive: true,
        productionEvents: {
          create: { productionMode: body.productionMode, startedAt: createdAt },
        },
        priorityHistory: {
          create: {
            previousOrder: null, newOrder: totalCount + 1,
            previousPriorityRank: null,
            newPriorityRank: activeCount < 5 ? activeCount + 1 : null,
            changedAt: createdAt, source: "machine_created",
          },
        },
      },
      select: { id: true, name: true, productionMode: true, requireWorkOrderAtOpen: true },
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      ipAddress: input.ipAddress, requestId: input.requestId,
    }, {
      action: "andon.machine.catalog.create", resourceType: "machine",
      resourceId: machine.id, machineId: machine.id,
      before: null, after: {
        id: machine.id, name: machine.name,
        productionMode: machine.productionMode,
        requireWorkOrderAtOpen: machine.requireWorkOrderAtOpen,
        priorityOrder, isActive: true,
      },
    });
    return { id: machine.id };
  });
}
