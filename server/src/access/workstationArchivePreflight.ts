import type { PrismaClient } from "@prisma/client";
import { AccessError } from "./policy.js";
import { resolveSession, type AccessRequest } from "./sessions.js";

/** Read-only preview. A later archive mutation MUST recheck every condition under locks. */
export const WORKSTATION_ARCHIVE_QUIET_MS = 15 * 60_000;

export type ArchiveBlocker =
  | "own_workstation"
  | "station_active"
  | "approval_pending"
  | "locked_machine"
  | "modules_enabled"
  | "recent_heartbeat"
  | "recent_contact"
  | "active_maintenance"
  | "active_access_session"
  | "kiosk_linked";

export type ArchiveInspection = {
  ownWorkstation: boolean;
  active: boolean;
  pendingApproval: boolean;
  admissionPending: boolean;
  lockedMachineId: string | null;
  modulesEnabled: boolean;
  lastHeartbeatAt: Date | null;
  lastSeenAt: Date;
  activeMaintenance: boolean;
  activeAccessSession: boolean;
  kioskLinked: boolean;
};

export function evaluateWorkstationArchive(
  info: ArchiveInspection, now = new Date(),
) {
  const blockers: ArchiveBlocker[] = [];
  const quietAfter = new Date(now.getTime() - WORKSTATION_ARCHIVE_QUIET_MS);
  if (info.ownWorkstation) blockers.push("own_workstation");
  if (info.active) blockers.push("station_active");
  if (info.pendingApproval || info.admissionPending) blockers.push("approval_pending");
  if (info.lockedMachineId) blockers.push("locked_machine");
  if (info.modulesEnabled) blockers.push("modules_enabled");
  if (info.lastHeartbeatAt &&
      (!Number.isFinite(info.lastHeartbeatAt.getTime()) ||
       info.lastHeartbeatAt > quietAfter)) blockers.push("recent_heartbeat");
  if (!Number.isFinite(info.lastSeenAt.getTime()) || info.lastSeenAt > quietAfter)
    blockers.push("recent_contact");
  if (info.activeMaintenance) blockers.push("active_maintenance");
  if (info.activeAccessSession) blockers.push("active_access_session");
  if (info.kioskLinked) blockers.push("kiosk_linked");
  return {
    blockers,
    canArchiveFromSystemChecks: blockers.length === 0,
    requiresPhysicalReview: true,
    archiveActionAvailable: false,
    quietPeriodMinutes: WORKSTATION_ARCHIVE_QUIET_MS / 60_000,
  };
}

/** Expose risk without granting any archive / delete privilege. */
export async function inspectWorkstationArchive(
  db: PrismaClient, session: AccessRequest, workstationId: string,
) {
  const principal = await resolveSession(db, session);
  if (!principal.isPrimaryAdmin || principal.purpose !== "normal")
    throw new AccessError("admin_required");
  const station = await db.workstation.findUnique({
    where: { id: workstationId },
    select: {
      id: true, active: true, pendingApproval: true, lockedMachineId: true,
      allowOperational: true, allowBi: true, allowPriorities: true,
      lastHeartbeatAt: true, lastSeenAt: true,
      admission: { select: { status: true } },
    },
  });
  if (!station) throw new AccessError("workstation_not_found", 404);
  const now = new Date();
  const [maintenance, access, kiosk] = await Promise.all([
    db.technicianSession.findFirst({
      where: { workstationId, endedAt: null }, select: { id: true },
    }),
    db.accessSession.findFirst({
      where: { workstationId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    }),
    db.accessSession.findFirst({
      where: { workstationId, user: { accountType: "kiosk" } },
      select: { id: true },
    }),
  ]);
  return {
    workstationId,
    ...evaluateWorkstationArchive({
      ownWorkstation: principal.workstationId === workstationId,
      active: station.active,
      pendingApproval: station.pendingApproval,
      admissionPending: station.admission?.status === "pending",
      lockedMachineId: station.lockedMachineId,
      modulesEnabled: station.allowOperational || station.allowBi || station.allowPriorities,
      lastHeartbeatAt: station.lastHeartbeatAt,
      lastSeenAt: station.lastSeenAt,
      activeMaintenance: Boolean(maintenance),
      activeAccessSession: Boolean(access),
      kioskLinked: Boolean(kiosk),
    }, now),
  };
}
