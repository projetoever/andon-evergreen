import { prisma } from "../db/prisma.js";
import {
  getSystemSettings,
  GLOBAL_SYSTEM_SETTINGS_ID,
} from "./systemSettings.js";

export type DashboardSoundMuteReason = "manual" | "auto";
export type DashboardSoundReactivationReason = "timeout" | "new_call" | null;

export interface DashboardSoundStatePayload {
  muted: boolean;
  mutedAt: Date | null;
  mutedUntil: Date | null;
  reason: DashboardSoundMuteReason | null;
  updatedAt: Date;
  reactivatedBy: DashboardSoundReactivationReason;
}

function normalizeMuteReason(value: string | null): DashboardSoundMuteReason | null {
  return value === "manual" || value === "auto" ? value : null;
}

function toPayload(
  settings: {
    dashboardSoundMuted: boolean;
    dashboardSoundMutedAt: Date | null;
    dashboardSoundMutedUntil: Date | null;
    dashboardSoundMuteReason: string | null;
    updatedAt: Date;
  },
  reactivatedBy: DashboardSoundReactivationReason = null,
): DashboardSoundStatePayload {
  return {
    muted: settings.dashboardSoundMuted,
    mutedAt: settings.dashboardSoundMutedAt,
    mutedUntil: settings.dashboardSoundMutedUntil,
    reason: normalizeMuteReason(settings.dashboardSoundMuteReason),
    updatedAt: settings.updatedAt,
    reactivatedBy,
  };
}

function calculateMutedUntil(
  timerEnabled: boolean,
  durationMinutes: number,
  now: Date,
) {
  if (!timerEnabled) return null;

  const safeDurationMinutes =
    Number.isInteger(durationMinutes) && durationMinutes >= 1
      ? durationMinutes
      : 3;

  return new Date(now.getTime() + safeDurationMinutes * 60_000);
}

export async function setDashboardSoundState(
  muted: boolean,
  reason: DashboardSoundMuteReason = "manual",
) {
  const current = await getSystemSettings();
  const now = new Date();

  const updated = await prisma.systemSettings.update({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    data: muted
      ? {
          dashboardSoundMuted: true,
          dashboardSoundMutedAt: now,
          dashboardSoundMutedUntil: calculateMutedUntil(
            current.dashboardSoundMuteTimerEnabled,
            current.dashboardSoundMuteDurationMinutes,
            now,
          ),
          dashboardSoundMuteReason: reason,
        }
      : {
          dashboardSoundMuted: false,
          dashboardSoundMutedAt: null,
          dashboardSoundMutedUntil: null,
          dashboardSoundMuteReason: null,
        },
  });

  return toPayload(updated);
}

export async function resolveDashboardSoundState() {
  let settings = await getSystemSettings();

  if (!settings.dashboardSoundMuted) {
    if (
      settings.dashboardSoundMutedAt ||
      settings.dashboardSoundMutedUntil ||
      settings.dashboardSoundMuteReason
    ) {
      settings = await prisma.systemSettings.update({
        where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
        data: {
          dashboardSoundMutedAt: null,
          dashboardSoundMutedUntil: null,
          dashboardSoundMuteReason: null,
        },
      });
    }

    return toPayload(settings);
  }

  if (!settings.dashboardSoundMutedAt) {
    const now = new Date();
    settings = await prisma.systemSettings.update({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      data: {
        dashboardSoundMutedAt: now,
        dashboardSoundMutedUntil: calculateMutedUntil(
          settings.dashboardSoundMuteTimerEnabled,
          settings.dashboardSoundMuteDurationMinutes,
          now,
        ),
        dashboardSoundMuteReason: normalizeMuteReason(
          settings.dashboardSoundMuteReason,
        ) ?? "manual",
      },
    });
  }

  const now = new Date();
  const expired =
    settings.dashboardSoundMutedUntil !== null &&
    settings.dashboardSoundMutedUntil.getTime() <= now.getTime();

  const newRealCall = settings.dashboardSoundMutedAt
    ? await prisma.andonCall.findFirst({
        where: {
          isSystemTest: false,
          openedAt: { gt: settings.dashboardSoundMutedAt },
        },
        select: { id: true },
      })
    : null;

  if (!expired && !newRealCall) {
    return toPayload(settings);
  }

  const reactivated = await prisma.systemSettings.update({
    where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
    data: {
      dashboardSoundMuted: false,
      dashboardSoundMutedAt: null,
      dashboardSoundMutedUntil: null,
      dashboardSoundMuteReason: null,
    },
  });

  return toPayload(
    reactivated,
    expired ? "timeout" : "new_call",
  );
}
