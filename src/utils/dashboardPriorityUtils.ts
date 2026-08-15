import type { AndonCall, AndonStatus } from "../types/andon";
import type { Machine, MachineStatus, ProductionMode } from "../types/machine";

export const MAX_DASHBOARD_CARDS = 14;

type DashboardMachine = Pick<
  Machine,
  "id" | "machineStatus" | "andonStatus" | "currentCallId" | "productionMode"
>;

type DashboardCall = Pick<AndonCall, "id" | "machineId" | "status" | "isSystemTest">;

type ActiveCallState = "open" | "attendance" | null;

function isAttendanceStatus(status: AndonStatus): boolean {
  return status === "in_progress" || status === "post_maintenance";
}

function isActiveCallStatus(status: AndonStatus): boolean {
  return status === "open" || isAttendanceStatus(status);
}

function getActiveCalls(
  machine: DashboardMachine,
  calls: readonly DashboardCall[],
): DashboardCall[] {
  return calls.filter(
    (call) =>
      call.machineId === machine.id && !call.isSystemTest && isActiveCallStatus(call.status),
  );
}

function getActiveCallState(
  machine: DashboardMachine,
  calls: readonly DashboardCall[],
): ActiveCallState {
  const activeCalls = getActiveCalls(machine, calls);

  if (activeCalls.some((call) => call.status === "open")) return "open";
  if (activeCalls.some((call) => isAttendanceStatus(call.status))) return "attendance";

  // Mantém a prioridade durante a pequena janela entre as atualizações de máquinas e chamados.
  if (machine.currentCallId && machine.andonStatus === "open") return "open";
  if (machine.currentCallId && isAttendanceStatus(machine.andonStatus)) return "attendance";

  return null;
}

function getOperationalTier(
  machineStatus: MachineStatus,
  activeCallState: ActiveCallState,
): number {
  if (machineStatus === "stopped" && activeCallState === "open") return 0;
  if (machineStatus === "stopped" && activeCallState === "attendance") return 1;
  if (machineStatus === "running" && activeCallState === "open") return 2;
  if (machineStatus === "running" && activeCallState === "attendance") return 3;
  if (machineStatus === "stopped") return 4;
  return 5;
}

function getProductionTieBreaker(productionMode: ProductionMode): number {
  return productionMode === "scheduled" ? 0 : 1;
}

export function getMachineNumber(machine: Pick<Machine, "id">): number {
  const value = Number(machine.id);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export function compareByMachineNumber(
  current: Pick<Machine, "id">,
  next: Pick<Machine, "id">,
): number {
  return (
    getMachineNumber(current) - getMachineNumber(next) ||
    current.id.localeCompare(next.id, "pt-BR", { numeric: true })
  );
}

export function getDashboardPriority(
  machine: DashboardMachine,
  calls: readonly DashboardCall[],
): number {
  const operationalTier = getOperationalTier(
    machine.machineStatus,
    getActiveCallState(machine, calls),
  );

  // A condição operacional sempre prevalece. O modo de produção desempata máquinas
  // no mesmo nível de urgência, sem ocultar chamados ativos fora de produção.
  return operationalTier * 2 + getProductionTieBreaker(machine.productionMode);
}

export function splitMachinesByDashboardPriority<T extends DashboardMachine>(
  machines: readonly T[],
  calls: readonly DashboardCall[],
  pageSize = MAX_DASHBOARD_CARDS,
): T[][] {
  const numericMachines = machines.slice().sort(compareByMachineNumber);
  const selectedIds = new Set(
    numericMachines
      .slice()
      .sort((current, next) => {
        const priorityDifference =
          getDashboardPriority(current, calls) - getDashboardPriority(next, calls);
        return priorityDifference || compareByMachineNumber(current, next);
      })
      .slice(0, pageSize)
      .map((machine) => machine.id),
  );

  const firstPage = numericMachines.filter((machine) => selectedIds.has(machine.id));
  const remaining = numericMachines.filter((machine) => !selectedIds.has(machine.id));
  const pages = [firstPage];

  for (let index = 0; index < remaining.length; index += pageSize) {
    pages.push(remaining.slice(index, index + pageSize));
  }

  return pages;
}

export function getDashboardPrioritySignature(
  machines: readonly DashboardMachine[],
  calls: readonly DashboardCall[],
): string {
  return machines
    .slice()
    .sort(compareByMachineNumber)
    .map((machine) => {
      const activeCallState = getActiveCallState(machine, calls) ?? "none";
      const activeCallSignature = getActiveCalls(machine, calls)
        .sort((current, next) => current.id.localeCompare(next.id))
        .map((call) => `${call.id}:${call.status}`)
        .join(",");
      return [
        machine.id,
        machine.machineStatus,
        machine.productionMode,
        machine.currentCallId ?? "none",
        activeCallState,
        activeCallSignature,
        getDashboardPriority(machine, calls),
      ].join(":");
    })
    .join("|");
}
