import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";
import {
  loadFromStorage,
  removeFromStorage,
  saveToStorage,
} from "@/services/localStorageService";
import * as andonService from "@/services/andonService";
import type { AndonCall } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { AppSettings, SoundConfig } from "@/types/settings";
import type { AndonRepository, AndonSnapshot } from "./andonRepository";

export class LocalAndonRepository implements AndonRepository {
  async loadSnapshot(): Promise<AndonSnapshot | null> {
    const machines = loadFromStorage<Machine[] | null>(LOCAL_STORAGE_KEYS.machines, null);
    const calls = loadFromStorage<AndonCall[] | null>(LOCAL_STORAGE_KEYS.calls, null);
    const settings = loadFromStorage<AppSettings | null>(LOCAL_STORAGE_KEYS.settings, null);
    const soundConfigs = loadFromStorage<SoundConfig[] | null>(
      LOCAL_STORAGE_KEYS.soundConfigs,
      null,
    );

    if (!machines || !calls || !settings || !soundConfigs) {
      return null;
    }

    return {
      machines: machines.map(andonService.normalizeMachine),
      calls: calls.map(andonService.normalizeAndonCall),
      settings,
      soundConfigs,
    };
  }

  async saveSnapshot(snapshot: AndonSnapshot): Promise<void> {
    saveToStorage(LOCAL_STORAGE_KEYS.machines, snapshot.machines);
    saveToStorage(LOCAL_STORAGE_KEYS.calls, snapshot.calls);
    saveToStorage(LOCAL_STORAGE_KEYS.settings, snapshot.settings);
    saveToStorage(LOCAL_STORAGE_KEYS.soundConfigs, snapshot.soundConfigs);
  }

  async resetSnapshot(): Promise<void> {
    Object.values(LOCAL_STORAGE_KEYS).forEach(removeFromStorage);
  }

  async openCall(machines: Machine[], calls: AndonCall[], params: andonService.OpenAndonCallParams) {
    return andonService.openAndonCall(machines, calls, params);
  }

  async attendCall(
    machines: Machine[],
    calls: AndonCall[],
    params: string | andonService.StartAttendanceParams,
  ) {
    return andonService.attendAndonCall(machines, calls, params);
  }

  async completeMaintenance(machines: Machine[], calls: AndonCall[], callId: string) {
    return andonService.completeMaintenanceAttendance(machines, calls, callId);
  }

  async returnToMaintenance(machines: Machine[], calls: AndonCall[], callId: string) {
    return andonService.returnToMaintenance(machines, calls, callId);
  }

  async addTechnicianSessions(
    machines: Machine[],
    calls: AndonCall[],
    params: andonService.AddTechnicianSessionsParams,
  ) {
    return andonService.addTechnicianSessions(machines, calls, params);
  }

  async endTechnicianSession(
    machines: Machine[],
    calls: AndonCall[],
    params: andonService.EndTechnicianSessionParams,
  ) {
    return andonService.endTechnicianSession(machines, calls, params);
  }

  async finishCall(
    machines: Machine[],
    calls: AndonCall[],
    params: andonService.FinishAndonCallParams,
  ) {
    return andonService.finishAndonCall(machines, calls, params);
  }

  async updateMachineStatus(
    machines: Machine[],
    machineId: string,
    status: import("@/types/machine").MachineStatus,
  ) {
    return andonService.updateMachineStatus(machines, machineId, status);
  }

  async updateMachineProductionMode(
    machines: Machine[],
    machineId: string,
    productionMode: import("@/types/machine").ProductionMode,
  ) {
    return andonService.updateMachineProductionMode(machines, machineId, productionMode);
  }


  async createMachine(machines: Machine[], params: import("./andonRepository").MachineCatalogInput) {
    if (machines.some((machine) => machine.id === params.id)) throw new Error("Já existe uma máquina com este id");
    const now = new Date().toISOString();
    const machine = andonService.normalizeMachine({
      id: params.id, name: params.name?.trim() || `Máquina ${params.id}`, machineStatus: "running", andonStatus: "none",
      currentCallId: null, lastStatusChangedAt: now, stoppedAt: null, lastStopDurationMinutes: 0, stopHistory: [],
      productionMode: params.productionMode ?? "scheduled", productionModeChangedAt: now, useCommercialShift: false, productionHistory: [],
      isActive: true, displayOrder: Number.isFinite(Number(params.id)) ? Number(params.id) : null,
    });
    const nextMachines = [...machines, machine].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
    return { machines: nextMachines, machine };
  }

  async updateMachineCatalog(machines: Machine[], machineId: string, patch: import("./andonRepository").MachineCatalogPatch) {
    let updated: Machine | undefined;
    const nextMachines = machines.map((machine) => {
      if (machine.id !== machineId) return machine;
      updated = andonService.normalizeMachine({ ...machine, name: patch.name?.trim() || machine.name, productionMode: patch.productionMode ?? machine.productionMode });
      return updated;
    });
    if (!updated) throw new Error("Máquina não encontrada");
    return { machines: nextMachines, machine: updated };
  }

  async updateMachineActive(machines: Machine[], machineId: string, isActive: boolean) {
    let updated: Machine | undefined;
    const nextMachines = machines.map((machine) => {
      if (machine.id !== machineId) return machine;
      if (!isActive && machine.currentCallId) throw new Error("Não é possível desativar máquina com chamado ativo");
      updated = andonService.normalizeMachine({ ...machine, isActive });
      return updated;
    });
    if (!updated) throw new Error("Máquina não encontrada");
    return { machines: nextMachines, machine: updated };
  }

  async updateMachineStopEventDescription(
    machines: Machine[],
    machineId: string,
    stopEventId: string,
    failureDescription: string,
    failureClassification?: Machine["stopHistory"][number]["failureClassification"],
  ) {
    return andonService.updateMachineStopEventDescription(
      machines,
      machineId,
      stopEventId,
      failureDescription,
      failureClassification,
    );
  }
}

export const localAndonRepository = new LocalAndonRepository();
