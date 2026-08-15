import assert from "node:assert/strict";
import test from "node:test";
import type { AndonCall } from "../src/types/andon";
import type { Machine } from "../src/types/machine";
import {
  getDashboardPriority,
  getDashboardPrioritySignature,
  splitMachinesByDashboardPriority,
} from "../src/utils/dashboardPriorityUtils";

function createMachine(id: string, patch: Partial<Machine> = {}): Machine {
  return {
    id,
    name: `Máquina ${id}`,
    machineStatus: "running",
    andonStatus: "none",
    currentCallId: null,
    lastStatusChangedAt: "2026-08-15T12:00:00.000Z",
    stoppedAt: null,
    lastStopDurationMinutes: 0,
    stopHistory: [],
    productionMode: "scheduled",
    isActive: true,
    displayOrder: Number(id),
    productionModeChangedAt: "2026-08-15T12:00:00.000Z",
    useCommercialShift: false,
    productionHistory: [],
    ...patch,
  };
}

function createCall(
  id: string,
  machineId: string,
  status: AndonCall["status"],
  patch: Partial<AndonCall> = {},
): AndonCall {
  return {
    id,
    machineId,
    category: "maintenance",
    subtype: "electrical",
    status,
    criticality: "medium",
    machineCondition: "running",
    openedAt: "2026-08-15T12:00:00.000Z",
    attendedAt: null,
    currentAttendanceStartedAt: null,
    maintenanceCompletedAt: null,
    finishedAt: null,
    technicianName: null,
    technicianNames: [],
    technicianArea: "electrical",
    callWaitingMinutes: 0,
    attendanceMinutes: 0,
    postMaintenanceMinutes: 0,
    maintenanceReturnCount: 0,
    totalCallMinutes: 0,
    machineStoppedMinutes: 0,
    notes: null,
    createdBy: null,
    origin: "kiosk",
    isSystemTest: false,
    updatedAt: "2026-08-15T12:00:00.000Z",
    ...patch,
  };
}

test("chamado ativo fora de produção permanece na primeira tela", () => {
  const machines = Array.from({ length: 15 }, (_, index) => createMachine(String(index + 1)));
  machines[14] = createMachine("15", {
    productionMode: "not_scheduled",
    andonStatus: "open",
    currentCallId: "call-15",
  });
  const calls = [createCall("call-15", "15", "open")];

  const [firstPage, secondPage] = splitMachinesByDashboardPriority(machines, calls);

  assert.equal(firstPage.length, 14);
  assert.ok(firstPage.some((machine) => machine.id === "15"));
  assert.deepEqual(
    secondPage.map((machine) => machine.id),
    ["14"],
  );
});

test("máquina parada com chamado ativo precede máquina parada sem chamado", () => {
  const stoppedWithoutCall = createMachine("1", { machineStatus: "stopped" });
  const stoppedInAttendance = createMachine("2", {
    machineStatus: "stopped",
    productionMode: "not_scheduled",
    andonStatus: "in_progress",
    currentCallId: "call-2",
  });
  const calls = [createCall("call-2", "2", "in_progress")];

  assert.ok(
    getDashboardPriority(stoppedInAttendance, calls) <
      getDashboardPriority(stoppedWithoutCall, calls),
  );
});

test("considera todos os chamados simultâneos ativos da máquina", () => {
  const machine = createMachine("3", {
    machineStatus: "stopped",
    andonStatus: "in_progress",
    currentCallId: "call-attendance",
  });
  const calls = [
    createCall("call-attendance", "3", "in_progress"),
    createCall("call-open", "3", "open", { subtype: "mechanical" }),
  ];
  const stoppedOpenMachine = createMachine("4", {
    machineStatus: "stopped",
    andonStatus: "open",
    currentCallId: "call-reference",
  });
  const referenceCalls = [createCall("call-reference", "4", "open")];

  assert.equal(
    getDashboardPriority(machine, calls),
    getDashboardPriority(stoppedOpenMachine, referenceCalls),
  );
});

test("ignora chamados automáticos de teste na prioridade operacional", () => {
  const machine = createMachine("5");
  const systemTestCall = createCall("system-test", "5", "open", {
    isSystemTest: true,
  });

  assert.equal(getDashboardPriority(machine, [systemTestCall]), getDashboardPriority(machine, []));
});

test("assinatura muda apenas quando a prioridade operacional muda", () => {
  const machine = createMachine("6", {
    andonStatus: "open",
    currentCallId: "call-6",
  });
  const call = createCall("call-6", "6", "open");
  const updatedCall = { ...call, updatedAt: "2026-08-15T12:01:00.000Z" };

  assert.equal(
    getDashboardPrioritySignature([machine], [call]),
    getDashboardPrioritySignature([machine], [updatedCall]),
  );
  assert.notEqual(
    getDashboardPrioritySignature([machine], [call]),
    getDashboardPrioritySignature([machine], [{ ...call, status: "in_progress" }]),
  );
});
