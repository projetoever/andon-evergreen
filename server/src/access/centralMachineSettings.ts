import type { PrismaClient } from "@prisma/client";
import { AccessError, assertModule } from "./policy.js";
import { tokenHash } from "./credentials.js";
import { lockUser, resolveSession } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { assertCentralMachineSettingsPrivilege } from "../security/centralMachineSettingsHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

/** Exact allowlist. No production mode, status, activation, priority or KPI writes. */
export function parseCentralMachineMetadataPatch(body: unknown):
  { name?: string; requireWorkOrderAtOpen?: boolean } {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new AccessError("invalid_input", 400);
  const fields = Object.keys(body);
  if (!fields.length || fields.length > 2 ||
      fields.some(key => key !== "name" && key !== "requireWorkOrderAtOpen"))
    throw new AccessError("invalid_input", 400);
  const values = body as Record<string, unknown>;
  const patch: { name?: string; requireWorkOrderAtOpen?: boolean } = {};
  if ("name" in values) {
    if (typeof values.name !== "string" || /[\x00-\x1f\x7f]/.test(values.name))
      throw new AccessError("invalid_input", 400);
    const name = values.name.trim();
    if (!name || [...name].length > 120)
      throw new AccessError("invalid_input", 400);
    patch.name = name;
  }
  if ("requireWorkOrderAtOpen" in values) {
    if (typeof values.requireWorkOrderAtOpen !== "boolean")
      throw new AccessError("invalid_input", 400);
    patch.requireWorkOrderAtOpen = values.requireWorkOrderAtOpen;
  }
  return patch;
}

export async function updateCentralMachineMetadata(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; machineId: string;
    body: unknown; ipAddress?: string; requestId?: string;
  },
) {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!parseWorkstationId(input.workstationId))
    throw new AccessError("workstation_identification_required");
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(input.machineId))
    throw new AccessError("invalid_input", 400);
  const patch = parseCentralMachineMetadataPatch(input.body);
  return db.$transaction(async tx => {
    const row = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!row) throw new AccessError("authentication_required", 401);
    await lockUser(tx, row.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    await lockMachineFlow(tx, input.machineId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== row.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true, allowOperational: true,
        allowBi: true, allowPriorities: true,
      },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(principal, station, "operational");
    assertCentralMachineSettingsPrivilege(principal);

    // A second session/grant check under locks prevents revocation or account
    // changes between the HTTP preflight and the actual database mutation.
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: {
        active: true, pendingApproval: true, allowOperational: true,
        allowBi: true, allowPriorities: true,
      },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertCentralMachineSettingsPrivilege(latest);

    const before = await tx.machine.findUnique({
      where: { id: input.machineId },
      select: { id: true, name: true, requireWorkOrderAtOpen: true },
    });
    if (!before) throw new AccessError("machine_not_found", 404);
    const changedKeys = Object.keys(patch).filter(key =>
      before[key as keyof typeof before] !== patch[key as keyof typeof patch]);
    if (!changedKeys.length) return { id: before.id, changed: false };
    const after = await tx.machine.update({
      where: { id: input.machineId }, data: patch,
      select: { id: true, name: true, requireWorkOrderAtOpen: true },
    });
    await appendAudit(tx, {
      ...actorFromPrincipal(latest),
      ipAddress: input.ipAddress, requestId: input.requestId,
    }, {
      action: "andon.machine.metadata.update",
      resourceType: "machine", resourceId: before.id, machineId: before.id,
      before: { values: before, changedKeys },
      after: { values: after, changedKeys },
    });
    return { id: after.id, changed: true };
  });
}
