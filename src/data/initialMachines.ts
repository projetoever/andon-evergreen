import { MACHINE_IDS } from "@/constants/appConstants";
import type { Machine } from "@/types/machine";

export function createInitialMachines(): Machine[] {
  const now = new Date().toISOString();
  return MACHINE_IDS.map((id) => ({
    id,
    name: `Máquina ${id}`,
    machineStatus: "running",
    andonStatus: "none",
    currentCallId: null,
    lastStatusChangedAt: now,
    stoppedAt: null,
    lastStopDurationMinutes: 0,
    stopHistory: [],
    productionMode: "scheduled",
    isActive: true,
    displayOrder: Number(id),
    productionModeChangedAt: now,
    useCommercialShift: false,
    productionHistory: [],
  }));
}
