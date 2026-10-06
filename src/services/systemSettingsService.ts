import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { SystemSettings, SystemSettingsPatch } from "@/types/systemSettings";

const apiClient = createAndonApiClient();
const LOCAL_SYSTEM_SETTINGS_KEY = "andonWebIndustrial.systemSettings.api";
let localSystemSettings: SystemSettings | null = null;

export const VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT = "andon:virtual-keyboard-setting-changed";
export const SYSTEM_SETTINGS_CHANGED_EVENT = "andon:system-settings-changed";

export interface DashboardSoundState {
  muted: boolean;
  mutedAt: string | null;
  mutedUntil: string | null;
  reason: "manual" | "auto" | null;
  updatedAt: string;
  reactivatedBy: "timeout" | "new_call" | null;
}


export function isValidDashboardSoundMuteDuration(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function createDefaultLocalSystemSettings(): SystemSettings {
  const now = new Date().toISOString();
  return {
    id: "global",
    allowWholeSetCalls: true,
    virtualKeyboardEnabled: true,
    requireWorkOrderAtOpen: false,
    restrictMaintenanceCompletionToAttendanceWorkstation: false,
    dashboardSoundMuteTimerEnabled: false,
    dashboardSoundMuteDurationMinutes: 3,
    dashboardSoundAutoMuteTimerEnabled: false,
    dashboardSoundActiveDurationMinutes: 3,
    dashboardSoundMuted: false,
    dashboardSoundMutedAt: null,
    dashboardSoundMutedUntil: null,
    dashboardSoundMuteReason: null,
    dashboardMachineOrderMode: "default",
    attendanceMode: "name",
    rfidReaderMode: "keyboard_hid",
    rfidInputTerminator: "enter",
    rfidCodeLength: null,
    createdAt: now,
    updatedAt: now,
  };
}

function readLocalSystemSettings() {
  if (localSystemSettings) return localSystemSettings;
  const fallback = createDefaultLocalSystemSettings();
  if (typeof window === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(LOCAL_SYSTEM_SETTINGS_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Partial<SystemSettings>;
    localSystemSettings = {
      ...fallback,
      ...parsed,
      restrictMaintenanceCompletionToAttendanceWorkstation:
        parsed.restrictMaintenanceCompletionToAttendanceWorkstation === true,
      dashboardSoundMuteTimerEnabled: parsed.dashboardSoundMuteTimerEnabled === true,
      dashboardSoundMuteDurationMinutes: isValidDashboardSoundMuteDuration(
        parsed.dashboardSoundMuteDurationMinutes,
      )
        ? parsed.dashboardSoundMuteDurationMinutes
        : 3,
      dashboardSoundAutoMuteTimerEnabled:
        parsed.dashboardSoundAutoMuteTimerEnabled === true,
      dashboardSoundActiveDurationMinutes: isValidDashboardSoundMuteDuration(
        parsed.dashboardSoundActiveDurationMinutes,
      )
        ? parsed.dashboardSoundActiveDurationMinutes
        : 3,
      dashboardSoundMuted: parsed.dashboardSoundMuted === true,
      dashboardSoundMutedAt:
        typeof parsed.dashboardSoundMutedAt === "string"
          ? parsed.dashboardSoundMutedAt
          : null,
      dashboardSoundMutedUntil:
        typeof parsed.dashboardSoundMutedUntil === "string"
          ? parsed.dashboardSoundMutedUntil
          : null,
      dashboardSoundMuteReason:
        parsed.dashboardSoundMuteReason === "manual" ||
        parsed.dashboardSoundMuteReason === "auto"
          ? parsed.dashboardSoundMuteReason
          : null,
      dashboardMachineOrderMode:
        parsed.dashboardMachineOrderMode === "priority" ? "priority" : "default",
    };
    return localSystemSettings;
  } catch {
    return fallback;
  }
}

function saveLocalSystemSettings(settings: SystemSettings) {
  localSystemSettings = settings;
  try {
    window.localStorage.setItem(LOCAL_SYSTEM_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // O modo local continua funcional em memória quando o storage estiver bloqueado.
  }
}

export function getSystemSettings() {
  if (CONFIGURED_DATA_MODE === "local") return Promise.resolve(readLocalSystemSettings());
  return apiClient.get<SystemSettings>("/api/system-settings");
}

export function getDashboardSoundState() {
  if (CONFIGURED_DATA_MODE === "local") {
    let settings = readLocalSystemSettings();
    const now = Date.now();
    const mutedUntilMs = settings.dashboardSoundMutedUntil
      ? new Date(settings.dashboardSoundMutedUntil).getTime()
      : null;

    if (
      settings.dashboardSoundMuted &&
      mutedUntilMs !== null &&
      Number.isFinite(mutedUntilMs) &&
      mutedUntilMs <= now
    ) {
      settings = {
        ...settings,
        dashboardSoundMuted: false,
        dashboardSoundMutedAt: null,
        dashboardSoundMutedUntil: null,
        dashboardSoundMuteReason: null,
        updatedAt: new Date(now).toISOString(),
      };
      saveLocalSystemSettings(settings);

      return Promise.resolve<DashboardSoundState>({
        muted: false,
        mutedAt: null,
        mutedUntil: null,
        reason: null,
        updatedAt: settings.updatedAt,
        reactivatedBy: "timeout",
      });
    }

    return Promise.resolve<DashboardSoundState>({
      muted: settings.dashboardSoundMuted,
      mutedAt: settings.dashboardSoundMutedAt,
      mutedUntil: settings.dashboardSoundMutedUntil,
      reason: settings.dashboardSoundMuteReason,
      updatedAt: settings.updatedAt,
      reactivatedBy: null,
    });
  }

  return apiClient.get<DashboardSoundState>("/api/dashboard-sound-state");
}

export async function updateDashboardSoundState(
  muted: boolean,
  reason: "manual" | "auto" = "manual",
) {
  if (typeof muted !== "boolean") {
    throw new Error("Campo muted deve ser booleano.");
  }
  if (reason !== "manual" && reason !== "auto") {
    throw new Error("Motivo do mute deve ser manual ou auto.");
  }

  if (CONFIGURED_DATA_MODE === "local") {
    const current = readLocalSystemSettings();
    const now = new Date();
    const mutedUntil =
      muted && current.dashboardSoundMuteTimerEnabled
        ? new Date(
            now.getTime() +
              current.dashboardSoundMuteDurationMinutes * 60_000,
          ).toISOString()
        : null;
    const settings = {
      ...current,
      dashboardSoundMuted: muted,
      dashboardSoundMutedAt: muted ? now.toISOString() : null,
      dashboardSoundMutedUntil: mutedUntil,
      dashboardSoundMuteReason: muted ? reason : null,
      updatedAt: now.toISOString(),
    };
    saveLocalSystemSettings(settings);

    return {
      muted: settings.dashboardSoundMuted,
      mutedAt: settings.dashboardSoundMutedAt,
      mutedUntil: settings.dashboardSoundMutedUntil,
      reason: settings.dashboardSoundMuteReason,
      updatedAt: settings.updatedAt,
      reactivatedBy: null,
    } satisfies DashboardSoundState;
  }

  return apiClient.patch<DashboardSoundState>("/api/dashboard-sound-state", {
    muted,
    reason,
  });
}

export async function updateSystemSettings(patch: SystemSettingsPatch) {
  if (
    patch.dashboardSoundMuteTimerEnabled !== undefined &&
    typeof patch.dashboardSoundMuteTimerEnabled !== "boolean"
  ) {
    throw new Error("Campo dashboardSoundMuteTimerEnabled deve ser booleano.");
  }

  if (
    patch.dashboardSoundMuteDurationMinutes !== undefined &&
    !isValidDashboardSoundMuteDuration(patch.dashboardSoundMuteDurationMinutes)
  ) {
    throw new Error("Tempo de silenciamento deve ser um número inteiro de pelo menos 1 minuto.");
  }

  if (
    patch.dashboardSoundAutoMuteTimerEnabled !== undefined &&
    typeof patch.dashboardSoundAutoMuteTimerEnabled !== "boolean"
  ) {
    throw new Error("Campo dashboardSoundAutoMuteTimerEnabled deve ser booleano.");
  }

  if (
    patch.dashboardSoundActiveDurationMinutes !== undefined &&
    !isValidDashboardSoundMuteDuration(patch.dashboardSoundActiveDurationMinutes)
  ) {
    throw new Error("Tempo de som ativo deve ser um número inteiro de pelo menos 1 minuto.");
  }

  if (patch.dashboardSoundMuted !== undefined && typeof patch.dashboardSoundMuted !== "boolean") {
    throw new Error("Campo dashboardSoundMuted deve ser booleano.");
  }

  if (
    patch.dashboardMachineOrderMode !== undefined &&
    patch.dashboardMachineOrderMode !== "default" &&
    patch.dashboardMachineOrderMode !== "priority"
  ) {
    throw new Error("Modo de organização do Dashboard inválido.");
  }

  const settings =
    CONFIGURED_DATA_MODE === "local"
      ? (() => {
          const current = readLocalSystemSettings();
          const now = new Date();
          const effectiveMuteTimerEnabled =
            patch.dashboardSoundMuteTimerEnabled ??
            current.dashboardSoundMuteTimerEnabled;
          const effectiveMuteDurationMinutes =
            patch.dashboardSoundMuteDurationMinutes ??
            current.dashboardSoundMuteDurationMinutes;
          const muted = patch.dashboardSoundMuted;

          return {
            ...current,
            ...patch,
            ...(muted === true
              ? {
                  dashboardSoundMutedAt: now.toISOString(),
                  dashboardSoundMutedUntil: effectiveMuteTimerEnabled
                    ? new Date(
                        now.getTime() +
                          effectiveMuteDurationMinutes * 60_000,
                      ).toISOString()
                    : null,
                  dashboardSoundMuteReason: "manual" as const,
                }
              : muted === false
                ? {
                    dashboardSoundMutedAt: null,
                    dashboardSoundMutedUntil: null,
                    dashboardSoundMuteReason: null,
                  }
                : {}),
            updatedAt: now.toISOString(),
          };
        })()
      : await apiClient.patch<SystemSettings>("/api/system-settings", patch);

  if (CONFIGURED_DATA_MODE === "local") saveLocalSystemSettings(settings);

  if (typeof window !== "undefined" && typeof patch.virtualKeyboardEnabled === "boolean") {
    window.dispatchEvent(
      new CustomEvent<boolean>(VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT, {
        detail: settings.virtualKeyboardEnabled,
      }),
    );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<SystemSettings>(SYSTEM_SETTINGS_CHANGED_EVENT, { detail: settings }),
    );
  }

  return settings;
}
