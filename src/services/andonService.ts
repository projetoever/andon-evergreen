import type {
  AndonCall,
  CallCategory,
  CallCriticality,
  CallSubtype,
  TechnicianArea,
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
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculateMachineStoppedMinutes,
  calculatePostMaintenanceMinutes,
  calculateTotalCallMinutes,
} from "@/utils/durationUtils";

export interface OpenAndonCallParams {
  machineId: string;
  category: CallCategory;
  subtype: CallSubtype;
  criticality?: CallCriticality;
}

export interface FinishAndonCallParams {
  callId: string;
  technicianName: string | null;
  technicianNames?: string[];
  technicianArea: TechnicianArea | null;
  notes?: string | null;
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
  };
  const technicianNames = Array.isArray(source.technicianNames)
    ? source.technicianNames.filter((name): name is string => typeof name === "string" && !!name)
    : call.technicianName
      ? [call.technicianName]
      : [];

  return {
    ...call,
    criticality: isCallCriticality(source.criticality) ? source.criticality : "medium",
    maintenanceCompletedAt:
      typeof source.maintenanceCompletedAt === "string" ? source.maintenanceCompletedAt : null,
    technicianNames,
    postMaintenanceMinutes:
      typeof source.postMaintenanceMinutes === "number" &&
      Number.isFinite(source.postMaintenanceMinutes)
        ? source.postMaintenanceMinutes
        : 0,
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
  const call: AndonCall = {
    id: generateId("call"),
    machineId: params.machineId,
    category: params.category,
    subtype: params.subtype,
    status: "open",
    criticality: params.criticality ?? "medium",
    openedAt: now,
    attendedAt: null,
    maintenanceCompletedAt: null,
    finishedAt: null,
    technicianName: null,
    technicianNames: [],
    technicianArea: null,
    callWaitingMinutes: 0,
    attendanceMinutes: 0,
    postMaintenanceMinutes: 0,
    totalCallMinutes: 0,
    machineStoppedMinutes: 0,
    notes: null,
    createdBy: "kiosk",
    updatedAt: now,
  };
  const newMachines = machines.map((m) =>
    m.id === params.machineId
      ? { ...m, andonStatus: "open" as const, currentCallId: call.id, lastStatusChangedAt: now }
      : m,
  );
  return { machines: newMachines, calls: [...calls, call], call };
}

export function attendAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  callId: string,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "open") throw new Error("Chamado não está aberto");
  const now = new Date().toISOString();
  const newCalls = calls.map((c) =>
    c.id === callId ? { ...c, status: "in_progress" as const, attendedAt: now, updatedAt: now } : c,
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
    maintenanceCompletedAt: now,
    attendanceMinutes: calculateAttendanceMinutes({ ...call, maintenanceCompletedAt: now }, now),
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

export function finishAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: FinishAndonCallParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status === "finished") throw new Error("Chamado já finalizado");

  const technicianNames = params.technicianNames?.length
    ? params.technicianNames
    : params.technicianName
      ? [params.technicianName]
      : call.technicianNames;
  const technicianName = technicianNames[0] ?? params.technicianName ?? null;

  if (call.category === "maintenance" && !technicianName) {
    throw new Error("Selecione um manutentor para chamados de manutenção");
  }
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const finishedCall: AndonCall = {
    ...call,
    status: "finished",
    finishedAt: now,
    technicianName,
    technicianNames,
    technicianArea: params.technicianArea,
    notes: params.notes ?? null,
    updatedAt: now,
  };
  finishedCall.callWaitingMinutes = calculateCallWaitingMinutes(finishedCall, now);
  finishedCall.attendanceMinutes = calculateAttendanceMinutes(finishedCall, now);
  finishedCall.postMaintenanceMinutes = calculatePostMaintenanceMinutes(finishedCall, now);
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
    // running -> fechar última parada aberta
    const updatedHistory = m.stopHistory.map((s, idx) => {
      if (idx === 0 && s.resumedAt === null) {
        const minutes = Math.max(
          0,
          Math.floor((new Date(now).getTime() - new Date(s.stoppedAt).getTime()) / 60000),
        );
        return { ...s, resumedAt: now, durationMinutes: minutes };
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
