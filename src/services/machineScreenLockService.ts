import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";

export interface MachineScreenLock {
  locked: boolean;
  machineId: string;
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getMachineScreenLock(): MachineScreenLock | null {
  if (!canUseLocalStorage()) return null;

  const rawLock = window.localStorage.getItem(LOCAL_STORAGE_KEYS.machineScreenLock);
  if (!rawLock) return null;

  try {
    const parsedLock = JSON.parse(rawLock) as Partial<MachineScreenLock>;
    if (parsedLock.locked === true && typeof parsedLock.machineId === "string" && parsedLock.machineId.trim()) {
      return { locked: true, machineId: parsedLock.machineId };
    }
  } catch {
    window.localStorage.removeItem(LOCAL_STORAGE_KEYS.machineScreenLock);
  }

  return null;
}

export function lockMachineScreen(machineId: string) {
  if (!canUseLocalStorage()) return;

  const lock: MachineScreenLock = { locked: true, machineId };
  window.localStorage.setItem(LOCAL_STORAGE_KEYS.machineScreenLock, JSON.stringify(lock));
}

export function unlockMachineScreen() {
  if (!canUseLocalStorage()) return;

  window.localStorage.removeItem(LOCAL_STORAGE_KEYS.machineScreenLock);
}
