import type { PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { lockUser, resolveSession, type AccessRequest } from "./sessions.js";

/** An online signal is a recent accepted browser heartbeat AND a valid central session.
 * lastSeenAt is legacy/historical evidence and must never be used to infer live presence.
 */
export const WORKSTATION_HEARTBEAT_INTERVAL_MS = 15_000;
export const WORKSTATION_HEARTBEAT_STALE_MS = 45_000;

export type WorkstationPresence = "online" | "offline" | "unknown";

export function deriveWorkstationPresence(
  input: {
    lastHeartbeatAt: Date | null;
    active: boolean;
    pendingApproval: boolean;
    hasValidCentralSession: boolean;
  },
  now: Date = new Date(),
): WorkstationPresence {
  if (!input.lastHeartbeatAt) return "unknown";
  const age = now.getTime() - input.lastHeartbeatAt.getTime();
  return input.active && !input.pendingApproval && input.hasValidCentralSession &&
    Number.isFinite(age) && age >= 0 && age <= WORKSTATION_HEARTBEAT_STALE_MS
    ? "online"
    : "offline";
}

/**
 * A liveness observation must not extend human interaction or absolute expiry.
 * Lock the actor and revalidate the current session before writing only the
 * workstation heartbeat; no recurring audit event is created.
 */
export async function recordWorkstationHeartbeat(db: PrismaClient, request: AccessRequest) {
  return db.$transaction(async (tx) => {
    const initial = await resolveSession(tx, request);
    if (initial.purpose !== "normal") throw new AccessError("authentication_required", 401);
    await lockUser(tx, initial.userId);
    const principal = await resolveSession(tx, request);
    if (principal.userId !== initial.userId ||
        principal.sessionId !== initial.sessionId ||
        principal.purpose !== "normal")
      throw new AccessError("authentication_required", 401);
    const updated = await tx.workstation.updateMany({
      where: {
        id: principal.workstationId,
        active: true,
        pendingApproval: false,
      },
      data: { lastHeartbeatAt: new Date() },
    });
    if (updated.count !== 1) throw new AccessError("workstation_denied");
    return { ok: true };
  });
}
