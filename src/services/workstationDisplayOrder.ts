import type { ManagedWorkstation } from "@/services/accessService";

type DisplayStation = Pick<ManagedWorkstation,
  "id" | "name" | "active" | "pendingApproval" | "presence" | "lastHeartbeatAt">;

/** Server-provided presence already combines heartbeat and authorized session.
 * Do not infer "online" from lastSeenAt, IP, station approval or stale login.
 */
export function workstationPresenceRank(station: DisplayStation, centralAccess: boolean): number {
  if (!centralAccess) return station.pendingApproval ? 0 : station.active ? 1 : 2;
  if (station.active && !station.pendingApproval && station.presence === "online") return 0;
  if (station.active && !station.pendingApproval) return 1;
  if (station.pendingApproval) return 2;
  return 3;
}

function heartbeatTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Stable, non-mutating list ordering: online first; then approved/unknown,
 * pending and blocked. Within state groups newest verified heartbeat first.
 * Current device is marked separately instead of overriding online ranking.
 */
export function compareWorkstationsForDisplay(
  a: DisplayStation, b: DisplayStation, centralAccess: boolean,
): number {
  const group = workstationPresenceRank(a, centralAccess) -
    workstationPresenceRank(b, centralAccess);
  if (group !== 0) return group;
  if (centralAccess) {
    const recent = heartbeatTime(b.lastHeartbeatAt) - heartbeatTime(a.lastHeartbeatAt);
    if (recent !== 0) return recent;
  }
  const labels = (a.name || "").localeCompare(b.name || "", "pt-BR");
  return labels || a.id.localeCompare(b.id);
}
