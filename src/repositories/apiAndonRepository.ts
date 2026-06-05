import { createAndonApiClient, type AndonApiClient } from "@/api/andonApiClient";
import type { AndonCall } from "@/types/andon";
import type { Machine, MachineStatus, ProductionMode } from "@/types/machine";
import type {
  AddTechnicianSessionsParams,
  EndTechnicianSessionParams,
  FinishAndonCallParams,
  OpenAndonCallParams,
  StartAttendanceParams,
} from "@/services/andonService";
import type { AndonRepository, AndonSnapshot } from "./andonRepository";

function throwApiRepositoryNotImplemented(): never {
  throw new Error(
    "Repositório API reservado para a futura API Node.js/PostgreSQL. Use o modo local nesta versão.",
  );
}

export class ApiAndonRepository implements AndonRepository {
  constructor(private readonly apiClient: AndonApiClient = createAndonApiClient()) {}

  async loadSnapshot(): Promise<AndonSnapshot | null> {
    return this.apiClient.getSnapshot();
  }

  async saveSnapshot(snapshot: AndonSnapshot): Promise<void> {
    await this.apiClient.replaceSnapshot(snapshot);
  }

  async resetSnapshot(): Promise<void> {
    throwApiRepositoryNotImplemented();
  }

  async openCall(_machines: Machine[], _calls: AndonCall[], _params: OpenAndonCallParams) {
    throwApiRepositoryNotImplemented();
  }

  async attendCall(_machines: Machine[], _calls: AndonCall[], _params: string | StartAttendanceParams) {
    throwApiRepositoryNotImplemented();
  }

  async completeMaintenance(_machines: Machine[], _calls: AndonCall[], _callId: string) {
    throwApiRepositoryNotImplemented();
  }

  async returnToMaintenance(_machines: Machine[], _calls: AndonCall[], _callId: string) {
    throwApiRepositoryNotImplemented();
  }

  async addTechnicianSessions(
    _machines: Machine[],
    _calls: AndonCall[],
    _params: AddTechnicianSessionsParams,
  ) {
    throwApiRepositoryNotImplemented();
  }

  async endTechnicianSession(
    _machines: Machine[],
    _calls: AndonCall[],
    _params: EndTechnicianSessionParams,
  ) {
    throwApiRepositoryNotImplemented();
  }

  async finishCall(_machines: Machine[], _calls: AndonCall[], _params: FinishAndonCallParams) {
    throwApiRepositoryNotImplemented();
  }

  async updateMachineStatus(_machines: Machine[], _machineId: string, _status: MachineStatus) {
    throwApiRepositoryNotImplemented();
  }

  async updateMachineProductionMode(
    _machines: Machine[],
    _machineId: string,
    _productionMode: ProductionMode,
  ) {
    throwApiRepositoryNotImplemented();
  }

  async updateMachineStopEventDescription(
    _machines: Machine[],
    _machineId: string,
    _stopEventId: string,
    _failureDescription: string,
    _failureClassification?: Machine["stopHistory"][number]["failureClassification"],
  ) {
    throwApiRepositoryNotImplemented();
  }
}

export const apiAndonRepository = new ApiAndonRepository();
