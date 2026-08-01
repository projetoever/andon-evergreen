import { createAndonApiClient } from "@/api/andonApiClient";
import type { SystemSettings, SystemSettingsPatch } from "@/types/systemSettings";

const apiClient = createAndonApiClient();

export function getSystemSettings() {
  return apiClient.get<SystemSettings>("/api/system-settings");
}

export function updateSystemSettings(patch: SystemSettingsPatch) {
  return apiClient.patch<SystemSettings>("/api/system-settings", patch);
}
