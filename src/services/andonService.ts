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
  calculateCallWaitingMinutes,
  calculateMachineStoppedMinutes,
  calculateTotalCallMinutes,
  diffMinutes,
} from "@/utils/durationUtils";

export interface OpenAndonCallParams {
  machineId: string;
  category: CallCategory;
  subtype: CallSubtype;
  criticality?: CallCriticality;
  machineCondition?: MachineStatus;
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
    currentAttendanceStartedAt?: unknown;
    maintenanceReturnCount?: unknown;
    machineCondition?: unknown;
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
    updatedAt: now,
  };
  const condition = params.machineCondition ?? machine.machineStatus;
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
  callId: string,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === callId);
  if (!call) throw new Error("Chamado não encontrado");
  if (call.status !== "open") throw new Error("Chamado não está aberto");
  const now = new Date().toISOString();
  const newCalls = calls.map((c) =>
    c.id === callId
      ? {
          ...c,
          status: "in_progress" as const,
          attendedAt: c.attendedAt ?? now,
          currentAttendanceStartedAt: now,
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
    currentAttendanceStartedAt: null,
    finishedAt: now,
    technicianName,
    technicianNames,
    technicianArea: params.technicianArea,
    notes: params.notes ?? null,
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
        return { ...s, resumedAt: now, durationMinutes: diffMinutes(s.stoppedAt, now) };
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
): { machines: Machine[]; machine: Machine } {
  const machine = machines.find((m) => m.id === machineId);
  if (!machine) throw new Error(`Máquina ${machineId} não encontrada`);
  const stopEvent = machine.stopHistory.find((event) => event.id === stopEventId);
  if (!stopEvent) throw new Error("Evento de falha não encontrado");

  const nextDescription = failureDescription.trim();
  const updatedMachines = machines.map((m) =>
    m.id === machineId
      ? {
          ...m,
          stopHistory: m.stopHistory.map((event) =>
            event.id === stopEventId
              ? { ...event, failureDescription: nextDescription || undefined }
              : event,
          ),
        }
      : m,
  );
  return { machines: updatedMachines, machine: updatedMachines.find((m) => m.id === machineId)! };
}
