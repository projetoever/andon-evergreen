import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";

type MachineSoundPreferences = Record<string, boolean>;

const apiClient = createAndonApiClient();
let cachedPreferences: MachineSoundPreferences = {};

export function getMachineSoundPreferences(): MachineSoundPreferences {
  return { ...cachedPreferences };
}

export function isMachineSoundEnabled(machineId: string): boolean {
  return cachedPreferences[machineId] ?? true;
}

export async function refreshMachineSoundPreferences() {
  if (CONFIGURED_DATA_MODE === "local") return getMachineSoundPreferences();

  const workstationId = getCurrentWorkstationId();
  if (!workstationId) {
    cachedPreferences = {};
    return cachedPreferences;
  }

  const runtime = await apiClient.get<{
    workstationId: string;
    machineSoundPreferences: MachineSoundPreferences;
  }>(`/api/workstations/${encodeURIComponent(workstationId)}/runtime-preferences`);

  cachedPreferences = runtime.machineSoundPreferences ?? {};
  return getMachineSoundPreferences();
}

export async function setMachineSoundEnabled(machineId: string, enabled: boolean) {
  if (CONFIGURED_DATA_MODE === "local") {
    cachedPreferences = {
      ...cachedPreferences,
      [machineId]: enabled,
    };
    return enabled;
  }

  const workstationId = getCurrentWorkstationId();
  if (!workstationId) throw new Error("Workstation não identificada.");

  await apiClient.request(
    `/api/workstations/${encodeURIComponent(workstationId)}/machine-sound/${encodeURIComponent(machineId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    },
  );

  cachedPreferences = {
    ...cachedPreferences,
    [machineId]: enabled,
  };
  return enabled;
}
