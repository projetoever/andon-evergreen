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
