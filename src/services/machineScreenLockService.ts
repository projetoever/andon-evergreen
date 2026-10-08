import { createAndonApiClient } from "@/api/andonApiClient";
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
  const workstationId = getCurrentWorkstationId();
  if (!workstationId) throw new Error("Workstation não identificada.");

  await apiClient.patch(
    `/api/workstations/${encodeURIComponent(workstationId)}/screen-lock`,
    { machineId: null },
  );
  cachedLock = null;
}
