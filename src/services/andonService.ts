import type {
  AndonCall,
  CallCategory,
  CallCriticality,
  CallSubtype,
  TechnicianArea,
  TechnicianAttendanceSession,
  TechnicianSessionEndReason,
  TechnicianTimeAllocation,
} from "@/types/andon";
import type {
  Machine,
  MachineProductionEvent,
  MachineStatus,
  MachineStopEvent,
  ProductionMode,
} from "@/types/machine";
import { generateId } from "@/utils/idUtils";
import {
  calculateCallWaitingMinutes,
  calculateMachineStoppedMinutes,
  calculateTotalCallMinutes,
  diffMinutes,
} from "@/utils/durationUtils";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { buildTechnicianTimeAllocations } from "@/utils/technicianTimeAllocationUtils";

export interface OpenAndonCallParams {
  machineId: string;
  category: CallCategory;
  subtype: CallSubtype;
  criticality?: CallCriticality;
  machineCondition?: MachineStatus;
}

export interface SelectedTechnicianInput {
  id?: string;
  name: string;
  shiftId?: string;
  shiftName?: string;
  technicalArea?: TechnicianArea;
}

export interface FinishAndonCallParams {
  callId: string;
  technicianName: string | null;
  technicianNames?: string[];
  technicianArea: TechnicianArea | null;
  notes?: string | null;
  selectedTechnicians?: SelectedTechnicianInput[];
}



export interface StartAttendanceParams {
  callId: string;
  technicians: SelectedTechnicianInput[];
  notes?: string | null;
}

export interface AddTechnicianSessionsParams {
  callId: string;
  technicians: SelectedTechnicianInput[];
}

export interface EndTechnicianSessionParams {
  callId: string;
  sessionId: string;
  notes?: string | null;
  endReason: TechnicianSessionEndReason;
}

function createSession(call: AndonCall, machine: Machine | undefined, technician: SelectedTechnicianInput, now: string, notes?: string | null): TechnicianAttendanceSession {
  return {
    id: generateId("session"), callId: call.id, machineId: call.machineId,
    technicianId: technician.id, technicianName: technician.name, technicalArea: technician.technicalArea ?? call.technicianArea ?? undefined,
    shiftId: technician.shiftId, shiftName: technician.shiftName, startedAt: now,
    notes: notes ?? undefined, productionModeAtStart: machine?.productionMode, machineStatusAtStart: machine?.machineStatus,
  };
}

/**
 * Camada de serviço pura — opera sobre arrays e retorna novas versões.
 * Hoje os dados vêm/voltam para LocalStorage via AndonContext.
 * No futuro essa mesma assinatura pode ser substituída por chamadas
 * a uma API Node.js sem alterar componentes.
 */

function isProductionMode(value: unknown): value is ProductionMode {
  return value === "scheduled" || value === "not_scheduled";
}

function isCallCriticality(value: unknown): value is CallCriticality {
  return value === "low" || value === "medium" || value === "high";
}

export function normalizeMachine(machine: Machine): Machine {
  const source = machine as Machine & {
    productionMode?: unknown;
    productionModeChangedAt?: unknown;
    useCommercialShift?: unknown;
    productionHistory?: unknown;
  };
  return {
    ...machine,
    productionMode: isProductionMode(source.productionMode) ? source.productionMode : "scheduled",
    productionModeChangedAt:
      typeof source.productionModeChangedAt === "string" && source.productionModeChangedAt
        ? source.productionModeChangedAt
        : machine.lastStatusChangedAt || new Date().toISOString(),
    useCommercialShift:
      typeof source.useCommercialShift === "boolean" ? source.useCommercialShift : false,
    productionHistory: Array.isArray(source.productionHistory)
      ? (source.productionHistory as MachineProductionEvent[])
      : [],
  };
}

export function normalizeAndonCall(call: AndonCall): AndonCall {
  const source = call as AndonCall & {
    criticality?: unknown;
    maintenanceCompletedAt?: unknown;
    technicianNames?: unknown;
    postMaintenanceMinutes?: unknown;
    currentAttendanceStartedAt?: unknown;
    maintenanceReturnCount?: unknown;
    machineCondition?: unknown;
    productionModeAtOpen?: unknown;
    productionModeAtAttend?: unknown;
    productionModeAtFinish?: unknown;
    machineStatusAtOpen?: unknown;
    machineStatusAtAttend?: unknown;
    machineStatusAtFinish?: unknown;
    technicianTimeAllocations?: unknown;
  };
  const technicianNames = Array.isArray(source.technicianNames)
    ? source.technicianNames.filter((name): name is string => typeof name === "string" && !!name)
    : call.technicianName
      ? [call.technicianName]
      : [];

  const maintenanceCompletedAt =
    typeof source.maintenanceCompletedAt === "string" ? source.maintenanceCompletedAt : null;
  const currentAttendanceStartedAt =
    typeof source.currentAttendanceStartedAt === "string"
      ? source.currentAttendanceStartedAt
      : call.status === "in_progress" && call.attendedAt && !maintenanceCompletedAt
        ? call.attendedAt
        : null;

  return {
    ...call,
    criticality: isCallCriticality(source.criticality) ? source.criticality : "medium",
    machineCondition:
      source.machineCondition === "stopped" || source.machineCondition === "running"
        ? source.machineCondition
        : "stopped",
    maintenanceCompletedAt,
    currentAttendanceStartedAt,
    technicianNames,
    technicianSessions: Array.isArray((source as any).technicianSessions) ? ((source as any).technicianSessions as TechnicianAttendanceSession[]) : [],
    technicianTimeAllocations: Array.isArray(source.technicianTimeAllocations)
      ? (source.technicianTimeAllocations as TechnicianTimeAllocation[])
      : [],
    postMaintenanceMinutes:
      typeof source.postMaintenanceMinutes === "number" &&
      Number.isFinite(source.postMaintenanceMinutes)
        ? source.postMaintenanceMinutes
        : 0,
    maintenanceReturnCount:
      typeof source.maintenanceReturnCount === "number" &&
      Number.isFinite(source.maintenanceReturnCount)
        ? source.maintenanceReturnCount
        : 0,
    productionModeAtOpen: source.productionModeAtOpen === "scheduled" || source.productionModeAtOpen === "not_scheduled" ? source.productionModeAtOpen : undefined,
    productionModeAtAttend: source.productionModeAtAttend === "scheduled" || source.productionModeAtAttend === "not_scheduled" ? source.productionModeAtAttend : undefined,
    productionModeAtFinish: source.productionModeAtFinish === "scheduled" || source.productionModeAtFinish === "not_scheduled" ? source.productionModeAtFinish : undefined,
    machineStatusAtOpen: source.machineStatusAtOpen === "running" || source.machineStatusAtOpen === "stopped" ? source.machineStatusAtOpen : undefined,
    machineStatusAtAttend: source.machineStatusAtAttend === "running" || source.machineStatusAtAttend === "stopped" ? source.machineStatusAtAttend : undefined,
    machineStatusAtFinish: source.machineStatusAtFinish === "running" || source.machineStatusAtFinish === "stopped" ? source.machineStatusAtFinish : undefined,
  };
}

export function openAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: OpenAndonCallParams,
): { machines: Machine[]; calls: AndonCall[]; call: AndonCall } {
  const machine = machines.find((m) => m.id === params.machineId);
  if (!machine) throw new Error(`Máquina ${params.machineId} não encontrada`);
  if (
    machine.andonStatus === "open" ||
    machine.andonStatus === "in_progress" ||
    machine.andonStatus === "post_maintenance"
  ) {
    throw new Error("Já existe um chamado ativo para esta máquina");
  }
  const now = new Date().toISOString();
  const condition = params.machineCondition ?? machine.machineStatus;
  const call: AndonCall = {
    id: generateId("call"),
    machineId: params.machineId,
    category: params.category,
    subtype: params.subtype,
    status: "open",
    criticality: params.criticality ?? "medium",
    machineCondition: params.machineCondition ?? machine.machineStatus,
    openedAt: now,
    attendedAt: null,
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: null,
    finishedAt: null,
    technicianName: null,
    technicianNames: [],
    technicianArea: null,
    callWaitingMinutes: 0,
    attendanceMinutes: 0,
    postMaintenanceMinutes: 0,
    maintenanceReturnCount: 0,
    totalCallMinutes: 0,
    machineStoppedMinutes: 0,
    notes: null,
    createdBy: "kiosk",
    technicianSessions: [],
    updatedAt: now,
    productionModeAtOpen: machine.productionMode,
    machineStatusAtOpen: condition,
  };
  const statusResult = updateMachineStatus(machines, params.machineId, condition);
  const newMachines = statusResult.machines.map((m) =>
    m.id === params.machineId
      ? { ...m, andonStatus: "open" as const, currentCallId: call.id, lastStatusChangedAt: now }
      : m,
  );
  return { machines: newMachines, calls: [...calls, call], call };
}

export function attendAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: string | StartAttendanceParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const callId = typeof params === "string" ? params : params.callId;
  const call = calls.find((c) => c.id === callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "open") throw new Error("Chamado não está aberto");
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const selectedTechnicians = typeof params === "string" ? [] : params.technicians;
  const shouldRequireTechnician = requiresMaintenanceTechnician(call);
  if (shouldRequireTechnician && selectedTechnicians.length === 0) {
    throw new Error("Selecione pelo menos um manutentor para iniciar o atendimento.");
  }
  const sessions = call.technicianSessions ?? [];
  const createdSessions = shouldRequireTechnician
    ? selectedTechnicians.map((t) => createSession(call, machine, t, now, typeof params === "string" ? null : params.notes))
    : [];
  const newCalls = calls.map((c) =>
    c.id === callId
      ? {
          ...c,
          status: "in_progress" as const,
          attendedAt: c.attendedAt ?? now,
          currentAttendanceStartedAt: now,
          productionModeAtAttend: machines.find((m) => m.id === c.machineId)?.productionMode,
          machineStatusAtAttend: machines.find((m) => m.id === c.machineId)?.machineStatus,
          technicianSessions: [...sessions, ...createdSessions],
          updatedAt: now,
        }
      : c,
  );
  const newMachines = machines.map((m) =>
    m.id === call.machineId
      ? { ...m, andonStatus: "in_progress" as const, lastStatusChangedAt: now }
      : m,
  );
  return { machines: newMachines, calls: newCalls };
}

export function completeMaintenanceAttendance(
  machines: Machine[],
  calls: AndonCall[],
  callId: string,
): { machines: Machine[]; calls: AndonCall[]; call: AndonCall } {
  const call = calls.find((c) => c.id === callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "in_progress") {
    throw new Error("Chamado não está em atendimento");
  }
  if (call.category !== "maintenance") {
    throw new Error("Apenas chamados de manutenção podem entrar em acompanhamento");
  }
  const now = new Date().toISOString();
  const updatedCall: AndonCall = {
    ...call,
    status: "post_maintenance",
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: now,
    attendanceMinutes:
      (call.attendanceMinutes ?? 0) +
      diffMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now),
    updatedAt: now,
  };
  const newCalls = calls.map((c) => (c.id === callId ? updatedCall : c));
  const newMachines = machines.map((m) =>
    m.id === call.machineId
      ? { ...m, andonStatus: "post_maintenance" as const, lastStatusChangedAt: now }
      : m,
  );
  return { machines: newMachines, calls: newCalls, call: updatedCall };
}

export function returnToMaintenance(
  machines: Machine[],
  calls: AndonCall[],
  callId: string,
): { machines: Machine[]; calls: AndonCall[]; call: AndonCall } {
  const call = calls.find((c) => c.id === callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "post_maintenance") {
    throw new Error("Chamado não está em acompanhamento");
  }
  if (call.category !== "maintenance") {
    throw new Error("Apenas chamados de manutenção podem voltar ao atendimento");
  }
  const now = new Date().toISOString();
  const updatedCall: AndonCall = {
    ...call,
    status: "in_progress",
    currentAttendanceStartedAt: now,
    maintenanceCompletedAt: null,
    postMaintenanceMinutes:
      (call.postMaintenanceMinutes ?? 0) + diffMinutes(call.maintenanceCompletedAt, now),
    maintenanceReturnCount: (call.maintenanceReturnCount ?? 0) + 1,
    updatedAt: now,
  };
  const newCalls = calls.map((c) => (c.id === callId ? updatedCall : c));
  const newMachines = machines.map((m) =>
    m.id === call.machineId
      ? { ...m, andonStatus: "in_progress" as const, lastStatusChangedAt: now }
      : m,
  );
  return { machines: newMachines, calls: newCalls, call: updatedCall };
}

export function addTechnicianSessions(
  machines: Machine[],
  calls: AndonCall[],
  params: AddTechnicianSessionsParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "in_progress") throw new Error("Chamado não está em atendimento");
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const currentSessions = call.technicianSessions ?? [];
  const active = new Set(currentSessions.filter((s)=>!s.endedAt).map((s)=>s.technicianName));
  const additions = params.technicians.filter((t)=>!active.has(t.name)).map((t)=>createSession(call,machine,t,now));
  const newCalls = calls.map((c)=> c.id===params.callId ? { ...c, technicianSessions:[...currentSessions,...additions], updatedAt: now } : c);
  return { machines, calls: newCalls };
}

export function endTechnicianSession(
  machines: Machine[],
  calls: AndonCall[],
  params: EndTechnicianSessionParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Chamado não encontrado");
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const newCalls = calls.map((c)=> c.id===params.callId ? { ...c, technicianSessions:(c.technicianSessions??[]).map((s)=> s.id===params.sessionId ? { ...s, endedAt: now, endReason: params.endReason, notes: params.notes ?? s.notes, productionModeAtEnd: machine?.productionMode, machineStatusAtEnd: machine?.machineStatus } : s), updatedAt: now } : c);
  return { machines, calls: newCalls };
}

export function finishAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: FinishAndonCallParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status === "finished") throw new Error("Chamado já finalizado");

  const sessionNames = Array.from(new Set((call.technicianSessions ?? []).map((session) => session.technicianName)));
  const selectedFinalNames = params.technicianNames?.length
    ? params.technicianNames
    : params.technicianName
      ? [params.technicianName]
      : call.technicianNames;
  const technicianNames = Array.from(new Set([...selectedFinalNames, ...sessionNames].filter(Boolean)));
  const technicianName = technicianNames[0] ?? params.technicianName ?? null;

  if (requiresMaintenanceTechnician(call) && !technicianName) {
    throw new Error("Selecione um manutentor para chamados de manutenção");
  }
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const selectedTechnicianIdsByName = new Map(
    (params.selectedTechnicians ?? [])
      .map((technician) => [technician.name.trim(), technician.id] as const)
      .filter(([name]) => Boolean(name)),
  );
  const technicianTimeAllocations = buildTechnicianTimeAllocations({
    call,
    finalizedAt: now,
    technicianNames,
    selectedTechnicianIdsByName,
  });
  const finishedCall: AndonCall = {
    ...call,
    status: "finished",
    currentAttendanceStartedAt: null,
    finishedAt: now,
    technicianName,
    technicianNames,
    technicianArea: params.technicianArea,
    notes: params.notes ?? null,
    productionModeAtFinish: machine?.productionMode,
    machineStatusAtFinish: machine?.machineStatus,
    technicianSessions: (call.technicianSessions ?? []).map((session) => session.endedAt ? session : { ...session, endedAt: now, endReason: "final_call", productionModeAtEnd: machine?.productionMode, machineStatusAtEnd: machine?.machineStatus }),
    technicianTimeAllocations,
    updatedAt: now,
  };
  finishedCall.callWaitingMinutes = calculateCallWaitingMinutes(finishedCall, now);
  finishedCall.attendanceMinutes =
    (call.attendanceMinutes ?? 0) +
    (call.status === "in_progress"
      ? diffMinutes(call.currentAttendanceStartedAt ?? call.attendedAt, now)
      : 0);
  finishedCall.postMaintenanceMinutes =
    (call.postMaintenanceMinutes ?? 0) +
    (call.status === "post_maintenance" ? diffMinutes(call.maintenanceCompletedAt, now) : 0);
  finishedCall.totalCallMinutes = calculateTotalCallMinutes(finishedCall, now);
  finishedCall.machineStoppedMinutes = machine ? calculateMachineStoppedMinutes(machine, now) : 0;
  const newCalls = calls.map((c) => (c.id === params.callId ? finishedCall : c));
  const newMachines = machines.map((m) =>
    m.id === call.machineId
      ? {
          ...m,
          andonStatus: "none" as const,
          currentCallId: null,
          lastStatusChangedAt: now,
        }
      : m,
  );
  return { machines: newMachines, calls: newCalls };
}

export function updateMachineStatus(
  machines: Machine[],
  machineId: string,
  newStatus: MachineStatus,
): { machines: Machine[] } {
  const now = new Date().toISOString();
  const newMachines = machines.map((m) => {
    if (m.id !== machineId) return m;
    if (m.machineStatus === newStatus) return m;
    if (newStatus === "stopped") {
      const stopEvent: MachineStopEvent = {
        id: generateId("stop"),
        machineId: m.id,
        stoppedAt: now,
        resumedAt: null,
        durationMinutes: 0,
        source: "manual_simulation",
        productionModeAtStart: m.productionMode,
      };
      const next: Machine = {
        ...m,
        machineStatus: "stopped",
        stoppedAt: now,
        lastStatusChangedAt: now,
        stopHistory: [stopEvent, ...m.stopHistory],
      };
      return next;
    }
    // running -> fechar última em falha aberta
    const updatedHistory = m.stopHistory.map((s, idx) => {
      if (idx === 0 && s.resumedAt === null) {
        return { ...s, resumedAt: now, durationMinutes: diffMinutes(s.stoppedAt, now), productionModeAtEnd: m.productionMode };
      }
      return s;
    });
    const lastDuration = updatedHistory[0]?.durationMinutes ?? m.lastStopDurationMinutes;
    return {
      ...m,
      machineStatus: "running" as const,
      stoppedAt: null,
      lastStatusChangedAt: now,
      lastStopDurationMinutes: lastDuration,
      stopHistory: updatedHistory,
    };
  });
  return { machines: newMachines };
}

export function updateMachineProductionMode(
  machines: Machine[],
  machineId: string,
  productionMode: ProductionMode,
): { machines: Machine[]; machine: Machine } {
  const now = new Date().toISOString();
  let updatedMachine: Machine | null = null;
  const newMachines = machines.map((m) => {
    if (m.id !== machineId) return m;
    if (m.productionMode === productionMode) {
      updatedMachine = m;
      return m;
    }

    const updatedHistory = m.productionHistory.map((event, index) => {
      if (index === 0 && event.endedAt === null) {
        return { ...event, endedAt: now, durationMinutes: diffMinutes(event.startedAt, now) };
      }
      return event;
    });
    const productionEvent: MachineProductionEvent = {
      id: generateId("production"),
      machineId: m.id,
      productionMode,
      startedAt: now,
      endedAt: null,
      durationMinutes: 0,
    };
    updatedMachine = {
      ...m,
      productionMode,
      productionModeChangedAt: now,
      productionHistory: [productionEvent, ...updatedHistory],
    };
    return updatedMachine;
  });

  if (!updatedMachine) throw new Error(`Máquina ${machineId} não encontrada`);
  return { machines: newMachines, machine: updatedMachine };
}

export function updateMachineStopEventDescription(
  machines: Machine[],
  machineId: string,
  stopEventId: string,
  failureDescription: string,
  failureClassification?: import("@/types/machine").FailureClassification,
): { machines: Machine[]; machine: Machine } {
  let updatedMachine: Machine | null = null;
  const newMachines = machines.map((m) => {
    if (m.id !== machineId) return m;
    const updatedHistory = m.stopHistory.map((event) =>
      event.id === stopEventId ? { ...event, failureDescription, failureClassification } : event,
    );
    updatedMachine = { ...m, stopHistory: updatedHistory };
    return updatedMachine;
  });

  if (!updatedMachine) throw new Error(`Máquina ${machineId} não encontrada`);
  return { machines: newMachines, machine: updatedMachine };
}
