import { createAndonApiClient } from "@/api/andonApiClient";
import type { SystemSettings, SystemSettingsPatch } from "@/types/systemSettings";

const apiClient = createAndonApiClient();

export const VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT = "andon:virtual-keyboard-setting-changed";

export function getSystemSettings() {
  return apiClient.get<SystemSettings>("/api/system-settings");
}

export async function updateSystemSettings(patch: SystemSettingsPatch) {
  const settings = await apiClient.patch<SystemSettings>("/api/system-settings", patch);

  if (typeof window !== "undefined" && typeof patch.virtualKeyboardEnabled === "boolean") {
    window.dispatchEvent(
      new CustomEvent<boolean>(VIRTUAL_KEYBOARD_SETTING_CHANGED_EVENT, {
        detail: settings.virtualKeyboardEnabled,
      }),
    );
  }

  return settings;
}
