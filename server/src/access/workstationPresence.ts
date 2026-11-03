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
