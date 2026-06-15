import { createAndonApiClient, type AndonApiClient } from "@/api/andonApiClient";
import { DEFAULT_SETTINGS } from "@/context/defaultSettings";
import { SOUND_CONFIGS } from "@/data/soundFiles";
import type { AndonCall, TechnicianAttendanceSession, TechnicianTimeAllocation } from "@/types/andon";
import type { Machine, MachineStatus, ProductionMode } from "@/types/machine";
import type {
  AddTechnicianSessionsParams,
  EndTechnicianSessionParams,
  FinishAndonCallParams,
  OpenAndonCallParams,
  StartAttendanceParams,
} from "@/services/andonService";
import { normalizeAndonCall, normalizeMachine } from "@/services/andonService";
import type { AndonRepository, AndonSnapshot } from "./andonRepository";

type ApiMachine = Partial<Machine> & { id: string; name: string; createdAt?: string; updatedAt?: string };
type ApiTechnicianSession = TechnicianAttendanceSession & { createdAt?: string; updatedAt?: string };
type ApiTechnicianTimeAllocation = TechnicianTimeAllocation & { totalSeconds?: number; createdAt?: string };
type ApiAndonCall = AndonCall & {
  createdAt?: string;
  technicianSessions?: ApiTechnicianSession[];
  technicianTimeAllocations?: ApiTechnicianTimeAllocation[];
};

function toIso(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function mapMachine(machine: ApiMachine): Machine {
  const now = new Date().toISOString();
  return normalizeMachine({
    id: machine.id,
    name: machine.name,
    machineStatus: machine.machineStatus ?? "running",
    andonStatus: machine.andonStatus === "normal" ? "none" : (machine.andonStatus ?? "none"),
    currentCallId: machine.currentCallId ?? null,
    lastStatusChangedAt: toIso(machine.lastStatusChangedAt, now),
    stoppedAt: machine.stoppedAt ?? null,
    lastStopDurationMinutes: machine.lastStopDurationMinutes ?? 0,
    stopHistory: machine.stopHistory ?? [],
    productionMode: machine.productionMode === "not_scheduled" ? "not_scheduled" : "scheduled",
    productionModeChangedAt: toIso(machine.productionModeChangedAt ?? machine.updatedAt, now),
    useCommercialShift: machine.useCommercialShift ?? false,
    productionHistory: machine.productionHistory ?? [],
  });
}

function mapTechnicianSession(session: ApiTechnicianSession): TechnicianAttendanceSession {
  return {
    ...session,
    startedAt: toIso(session.startedAt),
    endedAt: session.endedAt ? toIso(session.endedAt) : undefined,
  };
}

function mapTechnicianTimeAllocation(allocation: ApiTechnicianTimeAllocation): TechnicianTimeAllocation {
  return {
    ...allocation,
    startedAt: allocation.startedAt ? toIso(allocation.startedAt) : null,
    endedAt: allocation.endedAt ? toIso(allocation.endedAt) : null,
    minutes:
      typeof allocation.minutes === "number"
        ? allocation.minutes
        : Math.round(((allocation.totalSeconds ?? 0) / 60) * 100) / 100,
  };
}

function mapCall(call: ApiAndonCall): AndonCall {
  return normalizeAndonCall({
    ...call,
    openedAt: toIso(call.openedAt),
    attendedAt: call.attendedAt ? toIso(call.attendedAt) : null,
    currentAttendanceStartedAt: call.currentAttendanceStartedAt ? toIso(call.currentAttendanceStartedAt) : null,
    maintenanceCompletedAt: call.maintenanceCompletedAt ? toIso(call.maintenanceCompletedAt) : null,
    finishedAt: call.finishedAt ? toIso(call.finishedAt) : null,
    technicianName: call.technicianName ?? null,
    technicianNames: call.technicianNames ?? [],
    technicianArea: call.technicianArea ?? null,
    technicianSessions: Array.isArray(call.technicianSessions)
      ? call.technicianSessions.map(mapTechnicianSession)
      : [],
    technicianTimeAllocations: Array.isArray(call.technicianTimeAllocations)
      ? call.technicianTimeAllocations.map(mapTechnicianTimeAllocation)
      : [],
    notes: call.notes ?? null,
    createdBy: "kiosk",
    updatedAt: toIso(call.updatedAt ?? call.createdAt),
  });
}

export class ApiAndonRepository implements AndonRepository {
  constructor(private readonly apiClient: AndonApiClient = createAndonApiClient()) {}

  private async loadMachines() {
    return (await this.apiClient.get<ApiMachine[]>("/api/machines")).map(mapMachine);
  }

  private async loadCalls(path = "/api/andon-calls") {
    return (await this.apiClient.get<ApiAndonCall[]>(path)).map(mapCall);
  }

  private async loadResult() {
    const [machines, calls] = await Promise.all([this.loadMachines(), this.loadCalls()]);
    return { machines, calls };
  }

  async loadSnapshot(): Promise<AndonSnapshot | null> {
    const [machines, calls] = await Promise.all([this.loadMachines(), this.loadCalls()]);
    return { machines, calls, settings: DEFAULT_SETTINGS, soundConfigs: SOUND_CONFIGS };
  }

  async saveSnapshot(_snapshot: AndonSnapshot): Promise<void> {
    console.warn("Modo API não salva snapshots completos; use as operações controladas da API.");
  }

  async resetSnapshot(): Promise<void> {
    console.warn("Reset local não é aplicado no modo API.");
  }

  async openCall(_machines: Machine[], _calls: AndonCall[], params: OpenAndonCallParams) {
    const call = mapCall(await this.apiClient.post<ApiAndonCall>("/api/andon-calls", { ...params, createdBy: "kiosk" }));
    const result = await this.loadResult();
    return { ...result, call };
  }

  async attendCall(_machines: Machine[], _calls: AndonCall[], params: string | StartAttendanceParams) {
    const callId = typeof params === "string" ? params : params.callId;
    const technicians = typeof params === "string" ? [] : params.technicians;
    await this.apiClient.patch(`/api/andon-calls/${callId}/attend`, {
      technicianName: technicians[0]?.name,
      technicianNames: technicians.map((technician) => technician.name),
      technicianArea: technicians[0]?.technicalArea,
    });
    return this.loadResult();
  }

  async completeMaintenance(_machines: Machine[], _calls: AndonCall[], callId: string) {
    const call = mapCall(await this.apiClient.patch<ApiAndonCall>(`/api/andon-calls/${callId}/finish-maintenance`, {}));
    const result = await this.loadResult();
    return { ...result, call };
  }

  async returnToMaintenance(_machines: Machine[], _calls: AndonCall[], callId: string) {
    const call = mapCall(await this.apiClient.patch<ApiAndonCall>(`/api/andon-calls/${callId}/return-to-maintenance`, {}));
    const result = await this.loadResult();
    return { ...result, call };
  }

  async addTechnicianSessions(_machines: Machine[], _calls: AndonCall[], params: AddTechnicianSessionsParams) {
    for (const technician of params.technicians) {
      await this.apiClient.post<ApiAndonCall>(`/api/andon-calls/${params.callId}/technicians`, {
        technicianName: technician.name,
        technicianArea: technician.technicalArea,
      });
    }
    return this.loadResult();
  }

  async endTechnicianSession(_machines: Machine[], calls: AndonCall[], params: EndTechnicianSessionParams) {
    const call = calls.find((item) => item.id === params.callId);
    const session = call?.technicianSessions?.find((item) => item.id === params.sessionId);
    if (!session) throw new Error("Sessão de manutentor não encontrada");

    await this.apiClient.patch(
      `/api/andon-calls/${params.callId}/technicians/${encodeURIComponent(session.technicianName)}/end`,
      { reason: params.notes ?? params.endReason },
    );
    return this.loadResult();
  }

  async finishCall(_machines: Machine[], _calls: AndonCall[], params: FinishAndonCallParams) {
    await this.apiClient.patch(`/api/andon-calls/${params.callId}/finish`, {
      notes: params.notes,
      machineStatus: "running",
    });
    return this.loadResult();
  }

  async updateMachineStatus(_machines: Machine[], machineId: string, status: MachineStatus) {
    await this.apiClient.patch(`/api/machines/${machineId}/status`, { machineStatus: status });
    return { machines: await this.loadMachines() };
  }

  async updateMachineProductionMode(_machines: Machine[], machineId: string, productionMode: ProductionMode) {
    const machine = mapMachine(await this.apiClient.patch<ApiMachine>(`/api/machines/${machineId}/production-mode`, { productionMode }));
    return { machines: await this.loadMachines(), machine };
  }

  async updateMachineStopEventDescription(machines: Machine[], machineId: string) {
    const machine = machines.find((item) => item.id === machineId);
    if (!machine) throw new Error("Máquina não encontrada");
    console.warn("Descrição de parada permanece local: endpoint de eventos de falha é somente leitura nesta versão.");
    return { machines, machine };
  }
}

export const apiAndonRepository = new ApiAndonRepository();
