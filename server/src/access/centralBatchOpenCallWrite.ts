import type { Prisma, PrismaClient } from "@prisma/client";
import { tokenHash } from "./credentials.js";
import { resolveSession, lockUser } from "./sessions.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { lockMachineFlow } from "../db/machineFlowLock.js";
import { preflightCentralCallWrite } from "./centralCallWritePreflight.js";
import { assertModule, assertPermission, AccessError, type Principal } from "./policy.js";
import { appendAudit, actorFromPrincipal } from "./audit.js";

/** A batch is one transaction and all call audit events commit together.
 * This duplicates the single-open security sequence deliberately, rather
 * than granting a generic write bypass to unrelated routes.
 */
export function runCentralBatchOpenCallWrite<T extends { id: string; status: string }>(
  db: Pick<PrismaClient, "$transaction">,
  input: {
    token: string; workstationId: string; machineId: string;
    body: Record<string, unknown>; requestId?: string; ipAddress?: string;
  },
  apply: (tx: Prisma.TransactionClient, principal: Principal) => Promise<T[]>,
): Promise<T[]> {
  if (!/^[a-f0-9]{64}$/.test(input.token))
    throw new AccessError("authentication_required", 401);
  if (!input.workstationId || typeof input.machineId !== "string" ||
      !input.machineId.trim() || input.machineId.length > 160)
    throw new AccessError("invalid_action_resource", 400);
  if (Object.keys(input.body).some(key => ![
    "machineId", "subtypes", "criticality", "machineCondition",
    "workOrderNumber", "operatorNote",
  ].includes(key)))
    throw new AccessError("reserved_call_origin");
  const subtypes = input.body.subtypes;
  if (!Array.isArray(subtypes) || subtypes.length < 1 || subtypes.length > 20 ||
      subtypes.some(s => typeof s !== "string" || !s.trim() || s.length > 120) ||
      new Set(subtypes).size !== subtypes.length)
    throw new AccessError("invalid_input", 400);
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
    const preflight = await preflightCentralCallWrite({
      principal, workstation: station,
      request: { method: "POST", path: "/api/andon-calls/batch", body: input.body },
    });
    if (preflight.machineId !== input.machineId || preflight.operation !== "open_batch")
      throw new AccessError("invalid_action_resource", 400);
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
    const machine = await tx.machine.findUnique({
      where: { id: input.machineId }, select: { isActive: true },
    });
    if (!machine?.isActive) throw new AccessError("machine_inactive", 409);
    const created = await apply(tx, latest);
    if (!Array.isArray(created) || created.length !== subtypes.length ||
        created.some(call => !call || typeof call.id !== "string" || !call.id ||
          call.status !== "open") ||
        new Set(created.map(call => call.id)).size !== created.length)
      throw new AccessError("batch_open_invariant", 409);
    for (const [index, call] of created.entries()) {
      await appendAudit(tx, {
        ...actorFromPrincipal(latest), requestId: input.requestId,
        ipAddress: input.ipAddress,
      }, {
        action: "calls.open", resourceType: "andon_call",
        resourceId: call.id, machineId: input.machineId,
        after: { status: "open", origin: "kiosk", batch: true,
          batchSize: created.length, batchIndex: index + 1 },
      });
    }
    return created;
  });
}
