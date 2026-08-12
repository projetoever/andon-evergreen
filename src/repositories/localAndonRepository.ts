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

type OpenCallMachineSetSnapshotParams = andonService.OpenAndonCallParams & {
  machineSetId?: string | null;
  machineSetCodeSnapshot?: string | null;
  machineSetNameSnapshot?: string | null;
  machineSetTypeSnapshot?: string | null;
};

function appendAuditNote(currentNotes: string | null, note: string | null | undefined) {
  if (!note?.trim()) return currentNotes;
  const entry = `Cancelamento: ${note.trim()}`;
  return currentNotes ? `${currentNotes}\n${entry}` : entry;
}

function applyMachineSetSnapshotToLocalCall(
  result: { machines: Machine[]; calls: AndonCall[]; call: AndonCall },
  params: andonService.OpenAndonCallParams,
) {
  const snapshotParams = params as OpenCallMachineSetSnapshotParams;

  if (!snapshotParams.machineSetId && !snapshotParams.machineSetNameSnapshot && !snapshotParams.machineSetCodeSnapshot) {
    return result;
  }

  const patchedCall: AndonCall = {
    ...result.call,
    machineSetId: snapshotParams.machineSetId ?? null,
    machineSetCodeSnapshot: snapshotParams.machineSetCodeSnapshot ?? null,
    machineSetNameSnapshot: snapshotParams.machineSetNameSnapshot ?? null,
    machineSetTypeSnapshot: snapshotParams.machineSetTypeSnapshot ?? null,
  };

  return {
    ...result,
    call: patchedCall,
    calls: result.calls.map((call) => (call.id === patchedCall.id ? patchedCall : call)),
  };
}

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
    return applyMachineSetSnapshotToLocalCall(andonService.openAndonCall(machines, calls, params), params);
  }

  async openCalls(
    machines: Machine[],
    calls: AndonCall[],
    params: andonService.OpenAndonCallParams[],
  ) {
    const requestedKeys = new Set<string>();
    for (const item of params) {
      const key = `${item.machineId}:${item.subtype}`;
      if (requestedKeys.has(key)) throw new Error("Há setores duplicados na abertura em lote");
      requestedKeys.add(key);
      const duplicate = calls.find(
        (call) =>
          call.machineId === item.machineId &&
          call.subtype === item.subtype &&
          !call.isSystemTest &&
          (call.status === "open" ||
            call.status === "in_progress" ||
            call.status === "post_maintenance"),
      );
      if (duplicate) throw new Error("Já existe um chamado ativo deste setor para a máquina");
    }

    let nextMachines = machines;
    let nextCalls = calls;
    const baseOpenedAt = Date.now();
    for (const [index, item] of params.entries()) {
      const result = andonService.openAndonCall(nextMachines, nextCalls, item);
      const openedAt = new Date(baseOpenedAt + index).toISOString();
      const prioritizedCall = {
        ...result.call,
        openedAt,
        updatedAt: openedAt,
      };
      nextMachines = result.machines.map((machine) =>
        machine.id === item.machineId
          ? { ...machine, lastStatusChangedAt: openedAt }
          : machine,
      );
      nextCalls = result.calls.map((call) =>
        call.id === prioritizedCall.id ? prioritizedCall : call,
      );
    }
    return { machines: nextMachines, calls: nextCalls };
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

  async cancelCall(
    machines: Machine[],
    calls: AndonCall[],
    params: andonService.CancelAndonCallParams,
  ) {
    const result = andonService.cancelAndonCall(machines, calls, params);
    const cancelledSourceCall = calls.find((call) => call.id === params.callId);

    if (!cancelledSourceCall) return result;

    const now = new Date().toISOString();
    const cancelledCall: AndonCall = {
      ...cancelledSourceCall,
      status: "cancelled",
      finishedAt: now,
      currentAttendanceStartedAt: null,
      totalCallMinutes: andonService.normalizeAndonCall({ ...cancelledSourceCall, finishedAt: now }).totalCallMinutes,
      notes: appendAuditNote(cancelledSourceCall.notes, params.reason),
      updatedAt: now,
    };

    return {
      machines: result.machines,
      calls: [cancelledCall, ...result.calls],
    };
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
