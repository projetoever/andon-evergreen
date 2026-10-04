export type PriorityMachineState = {
  id: string;
  isActive: boolean;
  priorityOrder: number | null;
  displayOrder: number | null;
};

export type PrioritySnapshot = {
  orderedIds: string[];
  orderById: Map<string, number>;
  priorityRankById: Map<string, number>;
};

export type PriorityHistoryChange = {
  machineId: string;
  previousOrder: number | null;
  newOrder: number | null;
  previousPriorityRank: number | null;
  newPriorityRank: number | null;
};

function machineOrderValue(machine: PriorityMachineState) {
  if (machine.priorityOrder != null) return machine.priorityOrder;
  if (machine.displayOrder != null) return machine.displayOrder;
  const numericId = Number(machine.id);
  return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
}

export function sortPriorityMachineIds(machines: PriorityMachineState[]) {
  return machines
    .slice()
    .sort(
      (current, next) =>
        machineOrderValue(current) - machineOrderValue(next) ||
        current.id.localeCompare(next.id, "pt-BR", { numeric: true }),
    )
    .map((machine) => machine.id);
}

export function buildPrioritySnapshot(
  orderedIds: string[],
  byId: Map<string, PriorityMachineState>,
): PrioritySnapshot {
  const orderById = new Map(orderedIds.map((id, index) => [id, index + 1]));
  const priorityRankById = new Map<string, number>();

  orderedIds
    .filter((id) => byId.get(id)?.isActive)
    .slice(0, 5)
    .forEach((id, index) => priorityRankById.set(id, index + 1));

  return {
    orderedIds,
    orderById,
    priorityRankById,
  };
}

export function buildCurrentPrioritySnapshot(
  machines: PriorityMachineState[],
): PrioritySnapshot {
  const orderedIds = sortPriorityMachineIds(machines);
  return buildPrioritySnapshot(
    orderedIds,
    new Map(machines.map((machine) => [machine.id, machine])),
  );
}

export function diffPrioritySnapshots(
  machineIds: string[],
  previous: PrioritySnapshot,
  next: PrioritySnapshot,
): PriorityHistoryChange[] {
  return machineIds.flatMap((machineId) => {
    const previousOrder = previous.orderById.get(machineId) ?? null;
    const newOrder = next.orderById.get(machineId) ?? null;
    const previousPriorityRank = previous.priorityRankById.get(machineId) ?? null;
    const newPriorityRank = next.priorityRankById.get(machineId) ?? null;

    if (
      previousOrder === newOrder &&
      previousPriorityRank === newPriorityRank
    ) {
      return [];
    }

    return [
      {
        machineId,
        previousOrder,
        newOrder,
        previousPriorityRank,
        newPriorityRank,
      },
    ];
  });
}
