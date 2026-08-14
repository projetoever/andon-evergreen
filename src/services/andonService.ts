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
  calculateTotalCallMinutes,
  diffMinutes,
} from "@/utils/durationUtils";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { buildTechnicianTimeAllocations } from "@/utils/technicianTimeAllocationUtils";
import { calculateMachineConditionBreakdownForPeriod } from "@/utils/timeBreakdownUtils";

export interface OpenAndonCallParams {
  machineId: string;
  machineSetId?: string;
  machineSetCodeSnapshot?: string;
  machineSetNameSnapshot?: string;
  machineSetTypeSnapshot?: string;
  machineSubsetId?: string;
  machineSubsetCodeSnapshot?: string;
  machineSubsetNameSnapshot?: string;
  machineSubsetTypeSnapshot?: string;
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
  credential?: {
    method: "pin" | "rfid";
    value: string;
  };
}

export interface CancelAndonCallParams {
  callId: string;
  reason?: string | null;
  cancelledBy?: string | null;
}

export interface FinishAndonCallParams {
  callId: string;
  technicianName: string | null;
  technicianNames?: string[];
  technicianArea: TechnicianArea | null;
  notes?: string | null;
  selectedTechnicians?: SelectedTechnicianInput[];

  confirmedMachineSetId: string | null;
  confirmedMachineSetCodeSnapshot: string | null;
  confirmedMachineSetNameSnapshot: string | null;
  confirmedMachineSetTypeSnapshot: string | null;
  confirmedMachineSubsetId: string | null;
  confirmedMachineSubsetCodeSnapshot: string | null;
  confirmedMachineSubsetNameSnapshot: string | null;
  confirmedMachineSubsetTypeSnapshot: string | null;
  assetChangeReason?: string | null;
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
  sessionId?: string;
  technicianName?: string;
  credential?: {
    method: "pin" | "rfid";
    value: string;
  };
  notes?: string | null;
  endReason: TechnicianSessionEndReason;
}

function uniqueRegisteredTechnicianNames(names: Array<string | null | undefined>) {
  return Array.from(
    new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))),
  );
}

function resolveAutomaticAssetConfirmedBy(call: AndonCall) {
  const sessions = call.technicianSessions ?? [];

  const activeSessionNames = uniqueRegisteredTechnicianNames(
    sessions.filter((session) => !session.endedAt).map((session) => session.technicianName),
  );

  const allSessionNames = uniqueRegisteredTechnicianNames(
    sessions.map((session) => session.technicianName),
  );

  const legacyNames = uniqueRegisteredTechnicianNames([
    ...(call.technicianNames ?? []),
    call.technicianName,
  ]);

  const responsibleNames = activeSessionNames.length
    ? activeSessionNames
    : allSessionNames.length
      ? allSessionNames
      : legacyNames;

  if (requiresMaintenanceTechnician(call) && responsibleNames.length === 0) {
    throw new Error("O chamado de manutenção não possui mantenedor registrado");
  }

  return responsibleNames.length ? responsibleNames.join(", ") : "Operação";
}

function resolveAssetChangeReason(locationChanged: boolean, reason: string | null | undefined) {
  if (!locationChanged) {
    return null;
  }

  return reason?.trim() || "Não justificado";
}

function createSession(
  call: AndonCall,
  machine: Machine | undefined,
  technician: SelectedTechnicianInput,
  now: string,
  notes?: string | null,
): TechnicianAttendanceSession {
  return {
    id: generateId("session"),
    callId: call.id,
    machineId: call.machineId,
    technicianId: technician.id,
    technicianName: technician.name,
    technicalArea: technician.technicalArea ?? call.technicianArea ?? undefined,
    shiftId: technician.shiftId,
    shiftName: technician.shiftName,
    startedAt: now,
    notes: notes ?? undefined,
    productionModeAtStart: machine?.productionMode,
    machineStatusAtStart: machine?.machineStatus,
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
    isActive:
      typeof (source as { isActive?: unknown }).isActive === "boolean"
        ? (source as { isActive: boolean }).isActive
        : true,
    displayOrder:
      typeof (source as { displayOrder?: unknown }).displayOrder === "number"
        ? (source as { displayOrder: number }).displayOrder
        : null,
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
    createdBy?: unknown;
    origin?: unknown;
    isSystemTest?: unknown;
    confirmedMachineSetId?: unknown;
    confirmedMachineSetCodeSnapshot?: unknown;
    confirmedMachineSetNameSnapshot?: unknown;
    confirmedMachineSetTypeSnapshot?: unknown;
    confirmedMachineSubsetId?: unknown;
    confirmedMachineSubsetCodeSnapshot?: unknown;
    confirmedMachineSubsetNameSnapshot?: unknown;
    confirmedMachineSubsetTypeSnapshot?: unknown;
    assetConfirmedAt?: unknown;
    assetConfirmedBy?: unknown;
    assetLocationChanged?: unknown;
    assetChangeReason?: unknown;
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
    machineSetId: typeof source.machineSetId === "string" ? source.machineSetId : null,
    machineSetCodeSnapshot:
      typeof source.machineSetCodeSnapshot === "string" ? source.machineSetCodeSnapshot : null,
    machineSetNameSnapshot:
      typeof source.machineSetNameSnapshot === "string" ? source.machineSetNameSnapshot : null,
    machineSetTypeSnapshot:
      typeof source.machineSetTypeSnapshot === "string" ? source.machineSetTypeSnapshot : null,
    machineSubsetId: typeof source.machineSubsetId === "string" ? source.machineSubsetId : null,
    machineSubsetCodeSnapshot:
      typeof source.machineSubsetCodeSnapshot === "string"
        ? source.machineSubsetCodeSnapshot
        : null,
    machineSubsetNameSnapshot:
      typeof source.machineSubsetNameSnapshot === "string"
        ? source.machineSubsetNameSnapshot
        : null,
    machineSubsetTypeSnapshot:
      typeof source.machineSubsetTypeSnapshot === "string"
        ? source.machineSubsetTypeSnapshot
        : null,
    confirmedMachineSetId:
      typeof source.confirmedMachineSetId === "string" ? source.confirmedMachineSetId : null,
    confirmedMachineSetCodeSnapshot:
      typeof source.confirmedMachineSetCodeSnapshot === "string"
        ? source.confirmedMachineSetCodeSnapshot
        : null,
    confirmedMachineSetNameSnapshot:
      typeof source.confirmedMachineSetNameSnapshot === "string"
        ? source.confirmedMachineSetNameSnapshot
        : null,
    confirmedMachineSetTypeSnapshot:
      typeof source.confirmedMachineSetTypeSnapshot === "string"
        ? source.confirmedMachineSetTypeSnapshot
        : null,
    confirmedMachineSubsetId:
      typeof source.confirmedMachineSubsetId === "string" ? source.confirmedMachineSubsetId : null,
    confirmedMachineSubsetCodeSnapshot:
      typeof source.confirmedMachineSubsetCodeSnapshot === "string"
        ? source.confirmedMachineSubsetCodeSnapshot
        : null,
    confirmedMachineSubsetNameSnapshot:
      typeof source.confirmedMachineSubsetNameSnapshot === "string"
        ? source.confirmedMachineSubsetNameSnapshot
        : null,
    confirmedMachineSubsetTypeSnapshot:
      typeof source.confirmedMachineSubsetTypeSnapshot === "string"
        ? source.confirmedMachineSubsetTypeSnapshot
        : null,
    assetConfirmedAt: typeof source.assetConfirmedAt === "string" ? source.assetConfirmedAt : null,
    assetConfirmedBy: typeof source.assetConfirmedBy === "string" ? source.assetConfirmedBy : null,
    assetLocationChanged: source.assetLocationChanged === true,
    assetChangeReason:
      typeof source.assetChangeReason === "string" ? source.assetChangeReason : null,
    criticality: isCallCriticality(source.criticality) ? source.criticality : "medium",
    machineCondition:
      source.machineCondition === "stopped" || source.machineCondition === "running"
        ? source.machineCondition
        : "stopped",
    maintenanceCompletedAt,
    currentAttendanceStartedAt,
    technicianNames,
    technicianSessions: Array.isArray(source.technicianSessions)
      ? (source.technicianSessions as TechnicianAttendanceSession[])
      : [],
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
    productionModeAtOpen:
      source.productionModeAtOpen === "scheduled" || source.productionModeAtOpen === "not_scheduled"
        ? source.productionModeAtOpen
        : undefined,
    productionModeAtAttend:
      source.productionModeAtAttend === "scheduled" ||
      source.productionModeAtAttend === "not_scheduled"
        ? source.productionModeAtAttend
        : undefined,
    productionModeAtFinish:
      source.productionModeAtFinish === "scheduled" ||
      source.productionModeAtFinish === "not_scheduled"
        ? source.productionModeAtFinish
        : undefined,
    machineStatusAtOpen:
      source.machineStatusAtOpen === "running" || source.machineStatusAtOpen === "stopped"
        ? source.machineStatusAtOpen
        : undefined,
    machineStatusAtAttend:
      source.machineStatusAtAttend === "running" || source.machineStatusAtAttend === "stopped"
        ? source.machineStatusAtAttend
        : undefined,
    machineStatusAtFinish:
      source.machineStatusAtFinish === "running" || source.machineStatusAtFinish === "stopped"
        ? source.machineStatusAtFinish
        : undefined,
    createdBy: typeof source.createdBy === "string" ? source.createdBy : null,
    origin: source.origin === "installer_health_check" ? "installer_health_check" : "kiosk",
    isSystemTest: source.isSystemTest === true,
  };
}

export function openAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: OpenAndonCallParams,
): { machines: Machine[]; calls: AndonCall[]; call: AndonCall } {
  const machine = machines.find((m) => m.id === params.machineId);
  if (!machine) throw new Error(`Máquina ${params.machineId} não encontrada`);
  const duplicateSectorCall = calls.find(
    (call) =>
      call.machineId === params.machineId &&
      call.subtype === params.subtype &&
      !call.isSystemTest &&
      (call.status === "open" ||
        call.status === "in_progress" ||
        call.status === "post_maintenance"),
  );
  if (duplicateSectorCall) {
    throw new Error("Já existe um chamado ativo deste setor para a máquina");
  }
  const now = new Date().toISOString();
  const openStop = machine.stopHistory.find((event) => !event.resumedAt);
  const hasActiveStopOwner = Boolean(
    openStop?.callId &&
    calls.some(
      (call) =>
        call.id === openStop.callId &&
        !call.isSystemTest &&
        (call.status === "open" ||
          call.status === "in_progress" ||
          call.status === "post_maintenance"),
    ),
  );
  const condition =
    machine.machineStatus === "stopped" && hasActiveStopOwner
      ? "stopped"
      : (params.machineCondition ?? machine.machineStatus);
  const call: AndonCall = {
    id: generateId("call"),
    machineId: params.machineId,
    machineSetId: params.machineSetId ?? null,
    machineSetCodeSnapshot: params.machineSetCodeSnapshot ?? null,
    machineSetNameSnapshot: params.machineSetNameSnapshot ?? null,
    machineSetTypeSnapshot: params.machineSetTypeSnapshot ?? null,
    machineSubsetId: params.machineSubsetId ?? null,
    machineSubsetCodeSnapshot: params.machineSubsetCodeSnapshot ?? null,
    machineSubsetNameSnapshot: params.machineSubsetNameSnapshot ?? null,
    machineSubsetTypeSnapshot: params.machineSubsetTypeSnapshot ?? null,
    category: params.category,
    subtype: params.subtype,
    status: "open",
    criticality: params.criticality ?? "medium",
    machineCondition: condition,
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
    origin: "kiosk",
    isSystemTest: false,
    technicianSessions: [],
    updatedAt: now,
    productionModeAtOpen: machine.productionMode,
    machineStatusAtOpen: condition,
  };
  const statusResult = updateMachineStatus(machines, params.machineId, condition, call.id);
  const newMachines = statusResult.machines.map((m) => {
    if (m.id !== params.machineId) return m;

    const stopHistory =
      condition === "stopped" && !hasActiveStopOwner
        ? m.stopHistory.map((event) => (!event.resumedAt ? { ...event, callId: call.id } : event))
        : m.stopHistory;

    return {
      ...m,
      stopHistory,
      andonStatus: "open" as const,
      currentCallId: call.id,
    };
  });
  return { machines: newMachines, calls: [...calls, call], call };
}

function syncLocalMachineOperationalState(
  machines: Machine[],
  calls: AndonCall[],
  machineId: string,
) {
  const referenceCall = calls
    .map((call, index) => ({ call, index }))
    .filter(
      ({ call }) =>
        call.machineId === machineId &&
        !call.isSystemTest &&
        (call.status === "open" ||
          call.status === "in_progress" ||
          call.status === "post_maintenance"),
    )
    .sort(
      (current, next) =>
        next.call.openedAt.localeCompare(current.call.openedAt) || next.index - current.index,
    )[0]?.call;

  return machines.map((machine) =>
    machine.id === machineId
      ? {
          ...machine,
          andonStatus: referenceCall?.status ?? ("none" as const),
          currentCallId: referenceCall?.id ?? null,
        }
      : machine,
  );
}

function assertTechniciansMatchCallArea(
  call: Pick<AndonCall, "subtype">,
  technicians: SelectedTechnicianInput[],
) {
  const incompatible = technicians.find(
    (technician) => !technician.technicalArea || technician.technicalArea !== call.subtype,
  );
  if (incompatible) {
    throw new Error(`${incompatible.name} não pertence à área deste chamado`);
  }
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
  if (shouldRequireTechnician) {
    assertTechniciansMatchCallArea(call, selectedTechnicians);
  }
  const sessions = call.technicianSessions ?? [];
  const createdSessions = shouldRequireTechnician
    ? selectedTechnicians.map((t) =>
        createSession(call, machine, t, now, typeof params === "string" ? null : params.notes),
      )
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
  const newMachines = syncLocalMachineOperationalState(machines, newCalls, call.machineId);
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
  const newMachines = syncLocalMachineOperationalState(machines, newCalls, call.machineId);
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
  const newMachines = syncLocalMachineOperationalState(machines, newCalls, call.machineId);
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
  assertTechniciansMatchCallArea(call, params.technicians);
  const now = new Date().toISOString();
  const machine = machines.find((m) => m.id === call.machineId);
  const currentSessions = call.technicianSessions ?? [];
  const active = new Set(currentSessions.filter((s) => !s.endedAt).map((s) => s.technicianName));
  const additions = params.technicians
    .filter((t) => !active.has(t.name))
    .map((t) => createSession(call, machine, t, now));
  const newCalls = calls.map((c) =>
    c.id === params.callId
      ? { ...c, technicianSessions: [...currentSessions, ...additions], updatedAt: now }
      : c,
  );
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
  const targetSession = (call.technicianSessions ?? []).find(
    (session) =>
      !session.endedAt &&
      (params.sessionId
        ? session.id === params.sessionId
        : session.technicianName === params.technicianName),
  );
  if (!targetSession) throw new Error("Sessão ativa do mantenedor não encontrada");
  const newCalls = calls.map((c) =>
    c.id === params.callId
      ? {
          ...c,
          technicianSessions: (c.technicianSessions ?? []).map((s) =>
            s.id === targetSession.id
              ? {
                  ...s,
                  endedAt: now,
                  endReason: params.endReason,
                  notes: params.notes ?? s.notes,
                  productionModeAtEnd: machine?.productionMode,
                  machineStatusAtEnd: machine?.machineStatus,
                }
              : s,
          ),
          updatedAt: now,
        }
      : c,
  );
  return { machines, calls: newCalls };
}

export function finishAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: FinishAndonCallParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((item) => item.id === params.callId);

  if (!call) {
    throw new Error("Chamado não encontrado");
  }

  if (call.status === "finished" || call.status === "cancelled") {
    throw new Error("Chamado já encerrado");
  }

  const requiresAssetConfirmation = call.category === "maintenance";

  const assetConfirmedBy = requiresAssetConfirmation
    ? resolveAutomaticAssetConfirmedBy(call)
    : null;

  const sessionNames = Array.from(
    new Set((call.technicianSessions ?? []).map((session) => session.technicianName)),
  );

  const legacyNames = uniqueRegisteredTechnicianNames([
    ...(call.technicianNames ?? []),
    call.technicianName,
  ]);
  const technicianNames = sessionNames.length ? sessionNames : legacyNames;

  const technicianName = technicianNames[0] ?? params.technicianName ?? null;

  if (requiresMaintenanceTechnician(call) && !technicianName) {
    throw new Error("Selecione um manutentor para chamados de manutenção");
  }

  function assetKey(
    id: string | null | undefined,
    code: string | null | undefined,
    name: string | null | undefined,
    type: string | null | undefined,
  ) {
    if (id) {
      return `id:${id}`;
    }

    const values = [code?.trim() ?? "", name?.trim() ?? "", type?.trim() ?? ""];

    return values.some(Boolean) ? `snapshot:${values.join("|")}` : null;
  }

  const openingSetKey = assetKey(
    call.machineSetId,
    call.machineSetCodeSnapshot,
    call.machineSetNameSnapshot,
    call.machineSetTypeSnapshot,
  );
  const openingSubsetKey = assetKey(
    call.machineSubsetId,
    call.machineSubsetCodeSnapshot,
    call.machineSubsetNameSnapshot,
    call.machineSubsetTypeSnapshot,
  );
  const locationChanged = Boolean(
    requiresAssetConfirmation &&
    (openingSetKey || openingSubsetKey) &&
    (openingSetKey !==
      assetKey(
        params.confirmedMachineSetId,
        params.confirmedMachineSetCodeSnapshot,
        params.confirmedMachineSetNameSnapshot,
        params.confirmedMachineSetTypeSnapshot,
      ) ||
      openingSubsetKey !==
        assetKey(
          params.confirmedMachineSubsetId,
          params.confirmedMachineSubsetCodeSnapshot,
          params.confirmedMachineSubsetNameSnapshot,
          params.confirmedMachineSubsetTypeSnapshot,
        )),
  );

  const assetChangeReason = resolveAssetChangeReason(locationChanged, params.assetChangeReason);

  const now = new Date().toISOString();

  const machine = machines.find((item) => item.id === call.machineId);

  const shouldResumeOwnedStop = Boolean(
    machine?.machineStatus === "stopped" &&
    machine.stopHistory.some((event) => !event.resumedAt && event.callId === call.id),
  );

  const finalMachines = shouldResumeOwnedStop
    ? updateMachineStatus(machines, call.machineId, "running").machines
    : machines;

  const finalMachine = finalMachines.find((item) => item.id === call.machineId);

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
    productionModeAtFinish: finalMachine?.productionMode,
    machineStatusAtFinish: finalMachine?.machineStatus,

    confirmedMachineSetId: requiresAssetConfirmation ? params.confirmedMachineSetId : null,
    confirmedMachineSetCodeSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSetCodeSnapshot
      : null,
    confirmedMachineSetNameSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSetNameSnapshot
      : null,
    confirmedMachineSetTypeSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSetTypeSnapshot
      : null,

    confirmedMachineSubsetId: requiresAssetConfirmation ? params.confirmedMachineSubsetId : null,
    confirmedMachineSubsetCodeSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSubsetCodeSnapshot
      : null,
    confirmedMachineSubsetNameSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSubsetNameSnapshot
      : null,
    confirmedMachineSubsetTypeSnapshot: requiresAssetConfirmation
      ? params.confirmedMachineSubsetTypeSnapshot
      : null,

    assetConfirmedAt: requiresAssetConfirmation ? now : null,
    assetConfirmedBy,
    assetLocationChanged: locationChanged,
    assetChangeReason: locationChanged ? assetChangeReason : null,

    technicianSessions: (call.technicianSessions ?? []).map((session) =>
      session.endedAt
        ? session
        : {
            ...session,
            endedAt: now,
            endReason: "final_call",
            productionModeAtEnd: finalMachine?.productionMode,
            machineStatusAtEnd: finalMachine?.machineStatus,
          },
    ),

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

  finishedCall.machineStoppedMinutes = finalMachine
    ? calculateMachineConditionBreakdownForPeriod({
        periodStart: call.openedAt,
        periodEnd: now,
        stopHistory: finalMachine.stopHistory,
        fallbackMachineCondition: call.machineStatusAtOpen ?? call.machineCondition,
      }).failureSeconds / 60
    : 0;

  const finishedCalls = calls.map((item) => (item.id === params.callId ? finishedCall : item));

  return {
    calls: finishedCalls,
    machines: syncLocalMachineOperationalState(finalMachines, finishedCalls, call.machineId),
  };
}
export function cancelAndonCall(
  machines: Machine[],
  calls: AndonCall[],
  params: CancelAndonCallParams,
): { machines: Machine[]; calls: AndonCall[] } {
  const call = calls.find((c) => c.id === params.callId);
  if (!call) throw new Error("Chamado não encontrado");
  const hasTechnician = Boolean(
    call.technicianName || call.technicianNames?.length || call.technicianArea,
  );
  const hasAttendanceSession = Boolean(
    (call.technicianSessions ?? []).length || call.currentAttendanceStartedAt,
  );
  if (call.status !== "open" || call.attendedAt || hasTechnician || hasAttendanceSession) {
    throw new Error("Não é possível cancelar chamado já atendido.");
  }

  const newCalls = calls.filter((c) => c.id !== params.callId);
  const ownsOpenStop = machines.some(
    (machine) =>
      machine.id === call.machineId &&
      machine.stopHistory.some((event) => !event.resumedAt && event.callId === call.id),
  );
  const machinesAfterStopRecovery = ownsOpenStop
    ? updateMachineStatus(machines, call.machineId, "running").machines
    : machines;
  const newMachines = syncLocalMachineOperationalState(
    machinesAfterStopRecovery,
    newCalls,
    call.machineId,
  );
  return { machines: newMachines, calls: newCalls };
}

export function updateMachineStatus(
  machines: Machine[],
  machineId: string,
  newStatus: MachineStatus,
  ownerCallId?: string,
): { machines: Machine[] } {
  const now = new Date().toISOString();
  const newMachines = machines.map((m) => {
    if (m.id !== machineId) return m;
    if (m.machineStatus === newStatus) return m;
    if (newStatus === "stopped") {
      const stopEvent: MachineStopEvent = {
        id: generateId("stop"),
        machineId: m.id,
        callId: ownerCallId ?? null,
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
        return {
          ...s,
          resumedAt: now,
          durationMinutes: diffMinutes(s.stoppedAt, now),
          productionModeAtEnd: m.productionMode,
        };
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
