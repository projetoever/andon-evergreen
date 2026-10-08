import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import { getCurrentWorkstationId } from "@/services/workstationIdentityService";

export interface MachineScreenLock {
  locked: boolean;
  machineId: string;
}

const apiClient = createAndonApiClient();
let cachedLock: MachineScreenLock | null = null;

export function getMachineScreenLock(): MachineScreenLock | null {
  return cachedLock;
}

export async function refreshMachineScreenLock() {
  if (CONFIGURED_DATA_MODE === "local") return cachedLock;

  const workstationId = getCurrentWorkstationId();
  if (!workstationId) {
    cachedLock = null;
    return null;
  }

  const runtime = await apiClient.get<{
    workstationId: string;
    lockedMachineId: string | null;
  }>(`/api/workstations/${encodeURIComponent(workstationId)}/runtime-preferences`);

  cachedLock = runtime.lockedMachineId
    ? { locked: true, machineId: runtime.lockedMachineId }
    : null;
  return cachedLock;
}

export async function lockMachineScreen(machineId: string) {
  if (CONFIGURED_DATA_MODE === "local") {
    cachedLock = { locked: true, machineId };
    return cachedLock;
  }

  const workstationId = getCurrentWorkstationId();
  if (!workstationId) throw new Error("Workstation não identificada.");

  await apiClient.patch(
    `/api/workstations/${encodeURIComponent(workstationId)}/screen-lock`,
    { machineId },
  );
  cachedLock = { locked: true, machineId };
  return cachedLock;
}

export async function unlockMachineScreen() {
  if (CONFIGURED_DATA_MODE === "local") {
    cachedLock = null;
    return;
  }

  const workstationId = getCurrentWorkstationId();
  if (!workstationId) throw new Error("Workstation não identificada.");

  await apiClient.patch(
    `/api/workstations/${encodeURIComponent(workstationId)}/screen-lock`,
    { machineId: null },
  );
  cachedLock = null;
}
