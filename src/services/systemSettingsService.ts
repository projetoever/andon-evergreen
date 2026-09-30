import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { SystemSettings, SystemSettingsPatch } from "@/types/systemSettings";

const apiClient = createAndonApiClient();
const LOCAL_SYSTEM_SETTINGS_KEY = "andonWebIndustrial.systemSettings.api";
let localSystemSettings: SystemSettings | null = null;

export const VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT = "andon:virtual-keyboard-setting-changed";
export const SYSTEM_SETTINGS_CHANGED_EVENT = "andon:system-settings-changed";

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

  const settings =
    CONFIGURED_DATA_MODE === "local"
      ? {
          ...readLocalSystemSettings(),
          ...patch,
          updatedAt: new Date().toISOString(),
        }
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
