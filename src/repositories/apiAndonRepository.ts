import { createAndonApiClient, type AndonApiClient } from "@/api/andonApiClient";
import { DEFAULT_SETTINGS } from "@/context/defaultSettings";
import { SOUND_CONFIGS } from "@/data/soundFiles";
import type { AndonCall, TechnicianAttendanceSession, TechnicianTimeAllocation } from "@/types/andon";
import type { FailureClassification, Machine, MachineStatus, MachineStopEvent, ProductionMode, StopSource } from "@/types/machine";
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

function toIso(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return fallback;
}

function mapFailureEvent(event: ApiFailureEvent): MachineStopEvent {
  return {
    id: event.id,
    machineId: event.machineId,
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

function safeTimeMs(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function diffSeconds(startIso: string | null | undefined, endIso: string | null | undefined) {
  const start = safeTimeMs(startIso);
  const end = safeTimeMs(endIso);
  if (start === null || end === null || end <= start) return null;
  return (end - start) / 1000;
}

function secondsToMinutes(seconds: number | null, fallback: number | null | undefined) {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) {
    return seconds / 60;
  }
  return typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}

function diffMinutes(startIso: string, endIso: string) {
  return secondsToMinutes(diffSeconds(startIso, endIso), 0);
}

function calculateCallDurations(call: ApiAndonCall) {
  const now = new Date().toISOString();
  const openedAt = toIso(call.openedAt, now);
  const attendedAt = call.attendedAt ? toIso(call.attendedAt) : null;
  const maintenanceCompletedAt = call.maintenanceCompletedAt ? toIso(call.maintenanceCompletedAt) : null;
  const finishedAt = call.finishedAt ? toIso(call.finishedAt) : null;
  const callEnd = finishedAt ?? now;
  const attendanceEnd = maintenanceCompletedAt ?? finishedAt ?? (call.status === "in_progress" ? now : null);
  const postMaintenanceEnd = finishedAt ?? (call.status === "post_maintenance" ? now : null);
  const stoppedStatuses = new Set(["stopped", "failure", "failed"]);
  const wasStopped =
    stoppedStatuses.has(String(call.machineCondition ?? "")) ||
    stoppedStatuses.has(String(call.machineStatusAtOpen ?? ""));

  return {
    callWaitingMinutes: secondsToMinutes(
      diffSeconds(openedAt, attendedAt ?? (call.status === "open" ? now : null)),
      call.callWaitingMinutes,
    ),
    attendanceMinutes: secondsToMinutes(
      attendedAt ? diffSeconds(attendedAt, attendanceEnd) : null,
      call.attendanceMinutes,
    ),
    postMaintenanceMinutes: secondsToMinutes(
      maintenanceCompletedAt ? diffSeconds(maintenanceCompletedAt, postMaintenanceEnd) : null,
      call.postMaintenanceMinutes,
    ),
    totalCallMinutes: secondsToMinutes(diffSeconds(openedAt, callEnd), call.totalCallMinutes),
    machineStoppedMinutes: wasStopped
      ? secondsToMinutes(diffSeconds(openedAt, callEnd), call.machineStoppedMinutes)
      : secondsToMinutes(null, call.machineStoppedMinutes),
  };
}

function mapMachine(machine: ApiMachine, stopHistory: MachineStopEvent[] = []): Machine {
  const now = new Date().toISOString();
  const openStop = stopHistory.find((event) => !event.resumedAt);
  return normalizeMachine({
    id: machine.id,
    name: machine.name,
    machineStatus: machine.machineStatus ?? "running",
    andonStatus: machine.andonStatus === "normal" ? "none" : (machine.andonStatus ?? "none"),
    currentCallId: machine.currentCallId ?? null,
    lastStatusChangedAt: toIso(machine.lastStatusChangedAt, now),
    stoppedAt: machine.stoppedAt ?? openStop?.stoppedAt ?? null,
    lastStopDurationMinutes:
      machine.lastStopDurationMinutes ??
      (openStop ? diffMinutes(openStop.stoppedAt, now) : (stopHistory[0]?.durationMinutes ?? 0)),
    stopHistory,
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
  const durations = calculateCallDurations(call);

  return normalizeAndonCall({
    ...call,
    ...durations,
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

  private async loadFailureEvents() {
    return this.apiClient.get<ApiFailureEvent[]>("/api/failure-events");
  }

  private async loadMachines() {
    const [machines, failureEvents] = await Promise.all([
      this.apiClient.get<ApiMachine[]>("/api/machines"),
      this.loadFailureEvents(),
    ]);
    const stopHistoryByMachine = new Map<string, MachineStopEvent[]>();
    for (const event of failureEvents.map(mapFailureEvent)) {
      const history = stopHistoryByMachine.get(event.machineId) ?? [];
      history.push(event);
      stopHistoryByMachine.set(event.machineId, history);
    }
    return machines.map((machine) => mapMachine(machine, stopHistoryByMachine.get(machine.id) ?? []));
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

  async updateMachineStatus(machines: Machine[], machineId: string, status: MachineStatus) {
    if (status === "stopped") {
      const machine = machines.find((item) => item.id === machineId);
      await this.apiClient.post<FailureEventMutationResult>("/api/failure-events", {
        machineId,
        classification: "unidentified_stop",
        source: "manual",
        productionMode: machine?.productionMode,
        machineStatus: "stopped",
        notes: "Falha gerada pelo operador",
      });
      return { machines: await this.loadMachines() };
    }

    const openStop = machines
      .find((item) => item.id === machineId)
      ?.stopHistory.find((event) => !event.resumedAt);

    if (openStop) {
      await this.apiClient.patch<FailureEventMutationResult>(`/api/failure-events/${openStop.id}/finish`, {
        machineStatus: "running",
        notes: "Máquina pronta para rodar",
      });
    } else {
      await this.apiClient.patch(`/api/machines/${machineId}/status`, { machineStatus: status });
    }

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
