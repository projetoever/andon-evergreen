import type { Machine } from "@/types/machine";
import { updateMachineStatus } from "./andonService";

export function simulateMachineStopped(machines: Machine[], machineId: string) {
  return updateMachineStatus(machines, machineId, "stopped");
}

export function simulateMachineRunning(machines: Machine[], machineId: string) {
  return updateMachineStatus(machines, machineId, "running");
}
