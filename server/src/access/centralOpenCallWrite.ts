import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { resolveSession, lockUser } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { preflightCentralCallWrite } from "./centralCallWritePreflight.js";
import { assertModule, assertPermission, AccessError, type Principal } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";

/** Reviewed path for ONE kiosk-originated human call. All other writes stay denied.
 * Lock order: user -> workstation -> machine -> (domain category/failure locks).
 * The same legacy domain performs OS, duplicate sector, assets and stop owner updates.
 */
export function runCentralOpenCallWrite<T extends { id: string; status: string }>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; machineId: string;
    body: Record<string, unknown>; ipAddress?: string; requestId?: string;
  },
  apply: (tx: Prisma.TransactionClient, principal: Principal) => Promise<T>,
): Promise<T> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || typeof input.machineId !== "string" ||
      !input.machineId.trim() || input.machineId.length > 160)
    throw new AccessError("invalid_action_resource", 400);
  return db.$transaction(async tx => {
    const session = await tx.accessSession.findUnique({
      where: { tokenHash: tokenHash(input.token) }, select: { userId: true },
    });
    if (!session) throw new AccessError("authentication_required", 401);
    await lockUser(tx, session.userId);
    await lockWorkstationFlow(tx, input.workstationId);
    const request = { token: input.token, workstationId: input.workstationId };
    const principal = await resolveSession(tx, request);
    if (principal.userId !== session.userId)
      throw new AccessError("authentication_required", 401);
    const station = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { id: true, active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!station?.active || station.pendingApproval)
      throw new AccessError("workstation_inactive");
    await preflightCentralCallWrite({
      principal, workstation: station,
      request: { method: "POST", path: "/api/andon-calls", body: input.body },
    });
    await lockMachineFlow(tx, input.machineId);
    const latest = await resolveSession(tx, request);
    if (latest.userId !== principal.userId || latest.sessionId !== principal.sessionId)
      throw new AccessError("authentication_required", 401);
    const freshStation = await tx.workstation.findUnique({
      where: { id: input.workstationId },
      select: { active: true, pendingApproval: true,
        allowOperational: true, allowBi: true, allowPriorities: true },
    });
    if (!freshStation?.active || freshStation.pendingApproval)
      throw new AccessError("workstation_inactive");
    assertModule(latest, freshStation, "operational");
    assertPermission(latest, "calls.open", input.machineId);
    // Revalidate ownership of the actual machine inside the locked transaction.
    const machine = await tx.machine.findUnique({
      where: { id: input.machineId }, select: { isActive: true },
    });
    if (!machine?.isActive) throw new AccessError("machine_inactive", 409);
    const created = await apply(tx, latest);
    await appendAudit(tx, {
      ...actorFromPrincipal(latest), requestId: input.requestId,
      ipAddress: input.ipAddress,
    }, {
      action: "calls.open", resourceType: "andon_call",
      resourceId: created.id, machineId: input.machineId,
      after: { status: created.status, origin: "kiosk" },
    });
    return created;
  });
}
