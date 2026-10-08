import { createAndonApiClient } from "@/api/andonApiClient";
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
