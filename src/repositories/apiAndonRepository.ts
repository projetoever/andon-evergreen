import { createAndonApiClient, type AndonApiClient } from "@/api/andonApiClient";
import { DEFAULT_SETTINGS } from "@/context/defaultSettings";
import { SOUND_CONFIGS } from "@/data/soundFiles";
import type { AndonCall, TechnicianAttendanceSession, TechnicianTimeAllocation } from "@/types/andon";
import type { FailureClassification, Machine, MachineProductionEvent, MachineStatus, MachineStopEvent, ProductionMode, StopSource } from "@/types/machine";
import type {
  AddTechnicianSessionsParams,
  EndTechnicianSessionParams,
  FinishAndonCallParams,
  CancelAndonCallParams,
  OpenAndonCallParams,
  StartAttendanceParams,
} from "@/services/andonService";
import { normalizeAndonCall, normalizeMachine } from "@/services/andonService";
import {
  getLastServerTimestampIso,
  getServerNowIso,
  getServerTimeOffsetMs,
  setServerClockFromTimestamp,
} from "@/utils/serverClock";
import type { AndonRepository, AndonSnapshot } from "./andonRepository";

type ApiHealth = {
  status: string;
  service: string;
  timestamp: string;
};

type ServerClockSnapshot = {
  nowIso: string;
  timestampIso?: string;
  timeOffsetMs: number;
};

type ApiProductionEvent = {
  id: string;
  machineId: string;
  productionMode?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
};

type ApiMachine = Partial<Machine> & {
  id: string;
  name: string;
  isActive?: boolean;
  displayOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
  productionEvents?: ApiProductionEvent[];
};
type ApiFailureEvent = {
  id: string;
  machineId: string;
  callId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  classification?: string | null;
  source?: string | null;
  productionMode?: string | null;
  machineStatus?: string | null;
  notes?: string | null;
};
type FailureEventMutationResult = { event: ApiFailureEvent; machine: ApiMachine };
type ApiTechnicianSession = TechnicianAttendanceSession & { createdAt?: string; updatedAt?: string };
type ApiTechnicianTimeAllocation = TechnicianTimeAllocation & { totalSeconds?: number; createdAt?: string };
type ApiAndonCall = AndonCall & {
  createdAt?: string;
  technicianSessions?: ApiTechnicianSession[];
  technicianTimeAllocations?: ApiTechnicianTimeAllocation[];
};

function toIso(value: unknown, fallback = getServerNowIso()) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function mapFailureEvent(event: ApiFailureEvent): MachineStopEvent {
  return {
    id: event.id,
    machineId: event.machineId,
    callId: event.callId ?? null,
    stoppedAt: toIso(event.startedAt),
    resumedAt: event.endedAt ? toIso(event.endedAt) : null,
    durationMinutes:
      typeof event.durationSeconds === "number"
        ? event.durationSeconds / 60
        : event.endedAt
          ? diffMinutes(toIso(event.startedAt), toIso(event.endedAt))
          : 0,
    source: (event.source === "manual" ? "manual" : "system") as StopSource,
    failureDescription: event.notes ?? undefined,
    failureClassification: (event.classification ?? "unidentified_stop") as FailureClassification,
    productionModeAtStart:
      event.productionMode === "not_scheduled" || event.productionMode === "scheduled"
        ? event.productionMode
        : undefined,
  };
}

function diffMinutes(startIso: string, endIso: string) {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Number.isFinite(diffMs) && diffMs > 0 ? diffMs / 60000 : 0;
}

function mapProductionEvent(event: ApiProductionEvent): MachineProductionEvent {
  return {
    id: event.id,
    machineId: event.machineId,
    productionMode: event.productionMode === "not_scheduled" ? "not_scheduled" : "scheduled",
    startedAt: toIso(event.startedAt),
    endedAt: event.endedAt ? toIso(event.endedAt) : null,
    durationMinutes:
      typeof event.durationSeconds === "number"
        ? event.durationSeconds / 60
        : event.endedAt
          ? diffMinutes(toIso(event.startedAt), toIso(event.endedAt))
          : 0,
  };
}

function calculateCallDurations(call: ApiAndonCall, nowIso = getServerNowIso()) {
  const openedAt = toIso(call.openedAt, nowIso);
  const attendedAt = call.attendedAt ? toIso(call.attendedAt) : null;
  const finishedAt = call.finishedAt ? toIso(call.finishedAt) : null;
  const activeEnd = finishedAt ?? nowIso;
  const wasStopped = call.machineCondition === "stopped" || call.machineStatusAtOpen === "stopped";
  const hasPersistedStoppedDuration =
    finishedAt !== null && typeof call.machineStoppedMinutes === "number";

  return {
    callWaitingMinutes: attendedAt ? diffMinutes(openedAt, attendedAt) : diffMinutes(openedAt, nowIso),
    // These fields contain only completed cycles. The live segment is added by durationUtils,
    // keeping repeated maintenance/follow-up cycles cumulative instead of replacing the total.
    attendanceMinutes: call.attendanceMinutes ?? 0,
    postMaintenanceMinutes: call.postMaintenanceMinutes ?? 0,
    totalCallMinutes: diffMinutes(openedAt, activeEnd),
    machineStoppedMinutes: hasPersistedStoppedDuration
      ? call.machineStoppedMinutes ?? 0
      : wasStopped
        ? diffMinutes(openedAt, activeEnd)
        : (call.machineStoppedMinutes ?? 0),
  };
}

function mapMachine(machine: ApiMachine, stopHistory: MachineStopEvent[] = [], nowIso = getServerNowIso()): Machine {
  const sortedStopHistory = [...stopHistory].sort((a, b) => new Date(b.stoppedAt).getTime() - new Date(a.stoppedAt).getTime());
  const sortedProductionHistory = [
    ...(machine.productionHistory ?? []),
    ...(machine.productionEvents ?? []).map(mapProductionEvent),
  ].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const openStop = sortedStopHistory.find((event) => !event.resumedAt);
  const activeStoppedAt = machine.machineStatus === "stopped"
    ? openStop?.stoppedAt ?? machine.stoppedAt ?? toIso(machine.lastStatusChangedAt, nowIso)
    : null;
  return normalizeMachine({
    id: machine.id,
    name: machine.name,
    machineStatus: machine.machineStatus ?? "running",
    andonStatus: machine.andonStatus === "normal" ? "none" : (machine.andonStatus ?? "none"),
    currentCallId: machine.currentCallId ?? null,
    lastStatusChangedAt: toIso(machine.lastStatusChangedAt, nowIso),
    stoppedAt: activeStoppedAt,
    lastStopDurationMinutes:
      machine.lastStopDurationMinutes ??
      (openStop ? diffMinutes(openStop.stoppedAt, nowIso) : (sortedStopHistory[0]?.durationMinutes ?? 0)),
    stopHistory: sortedStopHistory,
    productionMode: machine.productionMode === "not_scheduled" ? "not_scheduled" : "scheduled",
    isActive: machine.isActive ?? true,
    displayOrder: machine.displayOrder ?? null,
    productionModeChangedAt: toIso(machine.productionModeChangedAt ?? machine.updatedAt, nowIso),
    useCommercialShift: machine.useCommercialShift ?? false,
    productionHistory: sortedProductionHistory,
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

function mapCall(call: ApiAndonCall, nowIso = getServerNowIso()): AndonCall {
  const durations = calculateCallDurations(call, nowIso);

  return normalizeAndonCall({
    ...call,
    ...durations,
    openedAt: toIso(call.openedAt, nowIso),
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
    createdBy: typeof call.createdBy === "string" ? call.createdBy : null,
    origin: call.origin === "installer_health_check" ? "installer_health_check" : "kiosk",
    isSystemTest: call.isSystemTest === true,
    updatedAt: toIso(call.updatedAt ?? call.createdAt, nowIso),
  });
}

export class ApiAndonRepository implements AndonRepository {
  constructor(private readonly apiClient: AndonApiClient = createAndonApiClient()) {}

  private async loadServerClock(): Promise<ServerClockSnapshot> {
    const clientStartedAtMs = Date.now();
    const health = await this.apiClient.get<ApiHealth>("/health");
    const clientEndedAtMs = Date.now();
    const timeOffsetMs = setServerClockFromTimestamp(health.timestamp, clientStartedAtMs, clientEndedAtMs);

    return {
      nowIso: getServerNowIso(),
      timestampIso: getLastServerTimestampIso() ?? health.timestamp,
      timeOffsetMs,
    };
  }

  private async loadFailureEvents() {
    return this.apiClient.get<ApiFailureEvent[]>("/api/failure-events?limit=500");
  }

  private async loadMachines(nowIso = getServerNowIso()) {
    const [machines, failureEvents] = await Promise.all([
      this.apiClient.get<ApiMachine[]>("/api/machines?includeInactive=true"),
      this.loadFailureEvents(),
    ]);
    const stopHistoryByMachine = new Map<string, MachineStopEvent[]>();
    for (const event of failureEvents.map(mapFailureEvent)) {
      const history = stopHistoryByMachine.get(event.machineId) ?? [];
      history.push(event);
      stopHistoryByMachine.set(event.machineId, history);
    }
    return machines.map((machine) => mapMachine(machine, stopHistoryByMachine.get(machine.id) ?? [], nowIso));
  }

  private async loadCalls(path = "/api/andon-calls", nowIso = getServerNowIso()) {
    return (await this.apiClient.get<ApiAndonCall[]>(path)).map((call) => mapCall(call, nowIso));
  }

  private async loadResult() {
    const serverClock = await this.loadServerClock();
    const [machines, calls] = await Promise.all([this.loadMachines(serverClock.nowIso), this.loadCalls("/api/andon-calls", serverClock.nowIso)]);
    return { machines, calls };
  }

  async loadSnapshot(): Promise<AndonSnapshot | null> {
    const serverClock = await this.loadServerClock();
    const [machines, calls] = await Promise.all([this.loadMachines(serverClock.nowIso), this.loadCalls("/api/andon-calls", serverClock.nowIso)]);
    return {
      machines,
      calls,
      settings: DEFAULT_SETTINGS,
      soundConfigs: SOUND_CONFIGS,
      serverTimestampIso: serverClock.timestampIso,
      serverTimeOffsetMs: serverClock.timeOffsetMs,
    };
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

  async openCalls(_machines: Machine[], _calls: AndonCall[], params: OpenAndonCallParams[]) {
    const first = params[0];
    if (!first || params.some((item) => item.machineId !== first.machineId)) {
      throw new Error("Os chamados em lote devem pertencer à mesma máquina");
    }

    await this.apiClient.post<ApiAndonCall[]>("/api/andon-calls/batch", {
      machineId: first.machineId,
      subtypes: params.map((item) => item.subtype),
      criticality: first.criticality ?? "medium",
      machineCondition: first.machineCondition,
    });
    return this.loadResult();
  }

  async attendCall(_machines: Machine[], _calls: AndonCall[], params: string | StartAttendanceParams) {
    const callId = typeof params === "string" ? params : params.callId;
    const technicians = typeof params === "string" ? [] : params.technicians;
    await this.apiClient.patch(`/api/andon-calls/${callId}/attend`, {
      technicianName: technicians[0]?.name,
      technicianNames: technicians.map((technician) => technician.name),
      technicianArea: technicians[0]?.technicalArea,
      credentials: technicians
        .map((technician) => technician.credential)
        .filter(Boolean),
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
    await this.apiClient.post<ApiAndonCall>(`/api/andon-calls/${params.callId}/technicians`, {
      technicianNames: params.technicians.map((technician) => technician.name),
      technicianArea: params.technicians[0]?.technicalArea,
      credentials: params.technicians
        .map((technician) => technician.credential)
        .filter(Boolean),
    });
    return this.loadResult();
  }

  async endTechnicianSession(_machines: Machine[], calls: AndonCall[], params: EndTechnicianSessionParams) {
    const call = calls.find((item) => item.id === params.callId);
    const session = call?.technicianSessions?.find((item) =>
      params.sessionId ? item.id === params.sessionId : item.technicianName === params.technicianName,
    );
    if (!params.credential && !session) throw new Error("Sessão de manutentor não encontrada");

    await this.apiClient.patch(
      `/api/andon-calls/${params.callId}/technicians/end`,
      {
        technicianName: params.technicianName ?? session?.technicianName,
        credential: params.credential,
        reason: params.endReason,
        notes: params.notes,
      },
    );
    return this.loadResult();
  }

  async finishCall(_machines: Machine[], _calls: AndonCall[], params: FinishAndonCallParams) {
    await this.apiClient.patch(`/api/andon-calls/${params.callId}/finish`, {
      notes: params.notes,
      confirmedMachineSetId:
        params.confirmedMachineSetId,
      confirmedMachineSubsetId:
        params.confirmedMachineSubsetId,
      assetChangeReason:
        params.assetChangeReason,
    });

    return this.loadResult();
  }

  async cancelCall(_machines: Machine[], _calls: AndonCall[], params: CancelAndonCallParams) {
    await this.apiClient.patch(`/api/andon-calls/${params.callId}/cancel`, {
      reason: params.reason,
      cancelledBy: params.cancelledBy,
    });
    return this.loadResult();
  }

  async updateMachineStatus(machines: Machine[], machineId: string, status: MachineStatus) {
    const machine = machines.find((item) => item.id === machineId);
    if (!machine) throw new Error("Máquina não encontrada");

    const openStops = machine.stopHistory.filter((event) => !event.resumedAt);

    if (status === "stopped") {
      if (machine.machineStatus === "stopped") {
        return { machines: await this.loadMachines() };
      }

      // Proteção contra falha aberta obsoleta no banco:
      // se a máquina está pronta/rodando, mas existe evento de falha aberto,
      // fecha o evento antigo antes de criar uma nova falha limpa.
      if (openStops.length > 0) {
        for (const openStop of openStops) {
          await this.apiClient.patch<FailureEventMutationResult>(`/api/failure-events/${openStop.id}/finish`, {
            machineStatus: "running",
            notes: "Encerramento automático de falha aberta obsoleta antes de nova falha",
          });
        }
      }

      await this.apiClient.post<FailureEventMutationResult>("/api/failure-events", {
        machineId,
        classification: "unidentified_stop",
        source: "manual",
        productionMode: machine.productionMode,
        machineStatus: "stopped",
        notes: "Falha gerada pelo operador",
      });

      return { machines: await this.loadMachines() };
    }

    if (openStops.length > 0) {
      for (const openStop of openStops) {
        await this.apiClient.patch<FailureEventMutationResult>(`/api/failure-events/${openStop.id}/finish`, {
          machineStatus: "running",
          notes: "Máquina pronta para rodar",
        });
      }
    } else {
      await this.apiClient.patch(`/api/machines/${machineId}/status`, { machineStatus: status });
    }

    return { machines: await this.loadMachines() };
  }

  async updateMachineProductionMode(_machines: Machine[], machineId: string, productionMode: ProductionMode) {
    const machine = mapMachine(await this.apiClient.patch<ApiMachine>(`/api/machines/${machineId}/production-mode`, { productionMode }));
    return { machines: await this.loadMachines(), machine };
  }


  async createMachine(_machines: Machine[], params: import("./andonRepository").MachineCatalogInput) {
    const machine = mapMachine(await this.apiClient.post<ApiMachine>("/api/machines", params));
    return { machines: await this.loadMachines(), machine };
  }

  async updateMachineCatalog(_machines: Machine[], machineId: string, patch: import("./andonRepository").MachineCatalogPatch) {
    const machine = mapMachine(await this.apiClient.patch<ApiMachine>(`/api/machines/${machineId}`, patch));
    return { machines: await this.loadMachines(), machine };
  }

  async updateMachineActive(_machines: Machine[], machineId: string, isActive: boolean) {
    const machine = mapMachine(await this.apiClient.patch<ApiMachine>(`/api/machines/${machineId}/active`, { isActive }));
    return { machines: await this.loadMachines(), machine };
  }

  async updateMachineStopEventDescription(
    machines: Machine[],
    machineId: string,
    stopEventId: string,
    failureDescription: string,
    failureClassification?: Machine["stopHistory"][number]["failureClassification"],
  ) {
    const machine = machines.find((item) => item.id === machineId);
    if (!machine) throw new Error("Máquina não encontrada");

    await this.apiClient.patch<FailureEventMutationResult>(`/api/failure-events/${stopEventId}`, {
      notes: failureDescription,
      classification: failureClassification ?? "unidentified_stop",
    });

    const nextMachines = await this.loadMachines();
    const updatedMachine = nextMachines.find((item) => item.id === machineId) ?? machine;

    return { machines: nextMachines, machine: updatedMachine };
  }
}

export const apiAndonRepository = new ApiAndonRepository();
