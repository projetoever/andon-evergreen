import type {
  AddTechnicianSessionsParams,
  EndTechnicianSessionParams,
  FinishAndonCallParams,
  OpenAndonCallParams,
  StartAttendanceParams,
} from "@/services/andonService";
import type { AndonCall } from "@/types/andon";
import type { Machine, MachineStatus, ProductionMode } from "@/types/machine";
import type { AppSettings, SoundConfig } from "@/types/settings";

export interface AndonSnapshot {
  machines: Machine[];
  calls: AndonCall[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
}

export interface AndonRepositoryResult {
  machines: Machine[];
  calls: AndonCall[];
}

export interface AndonRepositoryCallResult extends AndonRepositoryResult {
  call: AndonCall;
}

export interface AndonRepositoryMachineResult {
  machines: Machine[];
  machine: Machine;
}

/**
 * Contrato incremental para separar o frontend da origem dos dados.
 *
 * A implementação local mantém a regra atual baseada em arrays + LocalStorage no
 * AndonProvider. A implementação API é apenas um ponto de extensão para a futura
 * API Node.js/PostgreSQL e não é usada por padrão nesta tarefa.
 */
export interface AndonRepository {
  loadSnapshot(): Promise<AndonSnapshot | null>;
  saveSnapshot(snapshot: AndonSnapshot): Promise<void>;
  resetSnapshot(): Promise<void>;
  openCall(
    machines: Machine[],
    calls: AndonCall[],
    params: OpenAndonCallParams,
  ): Promise<AndonRepositoryCallResult>;
  attendCall(
    machines: Machine[],
    calls: AndonCall[],
    params: string | StartAttendanceParams,
  ): Promise<AndonRepositoryResult>;
  completeMaintenance(
    machines: Machine[],
    calls: AndonCall[],
    callId: string,
  ): Promise<AndonRepositoryCallResult>;
  returnToMaintenance(
    machines: Machine[],
    calls: AndonCall[],
    callId: string,
  ): Promise<AndonRepositoryCallResult>;
  addTechnicianSessions(
    machines: Machine[],
    calls: AndonCall[],
    params: AddTechnicianSessionsParams,
  ): Promise<Pick<AndonRepositoryResult, "calls">>;
  endTechnicianSession(
    machines: Machine[],
    calls: AndonCall[],
    params: EndTechnicianSessionParams,
  ): Promise<Pick<AndonRepositoryResult, "calls">>;
  finishCall(
    machines: Machine[],
    calls: AndonCall[],
    params: FinishAndonCallParams,
  ): Promise<AndonRepositoryResult>;
  updateMachineStatus(
    machines: Machine[],
    machineId: string,
    status: MachineStatus,
  ): Promise<Pick<AndonRepositoryResult, "machines">>;
  updateMachineProductionMode(
    machines: Machine[],
    machineId: string,
    productionMode: ProductionMode,
  ): Promise<AndonRepositoryMachineResult>;
  updateMachineStopEventDescription(
    machines: Machine[],
    machineId: string,
    stopEventId: string,
    failureDescription: string,
    failureClassification?: Machine["stopHistory"][number]["failureClassification"],
  ): Promise<AndonRepositoryMachineResult>;
}
