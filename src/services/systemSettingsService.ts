import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { SystemSettings, SystemSettingsPatch } from "@/types/systemSettings";

const apiClient = createAndonApiClient();
const LOCAL_SYSTEM_SETTINGS_KEY = "andonWebIndustrial.systemSettings.api";
let localSystemSettings: SystemSettings | null = null;

export const VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT = "andon:virtual-keyboard-setting-changed";

function createDefaultLocalSystemSettings(): SystemSettings {
  const now = new Date().toISOString();
  return {
    id: "global",
    allowWholeSetCalls: true,
    virtualKeyboardEnabled: true,
    andonSoundMuted: false,
    requireWorkOrderAtOpen: false,
    restrictMaintenanceCompletionToAttendanceWorkstation: false,
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
      andonSoundMuted: parsed.andonSoundMuted === true,
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

  return settings;
}
