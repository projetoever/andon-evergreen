import { MINIMUM_EFFICIENCY_PERCENT, SHIFT_CONFIGS } from "@/constants/shiftRules";
import type { Machine, MachineEfficiencySnapshot } from "@/types/machine";
import { getCurrentShiftType, getShiftLabel, getShiftWindow } from "@/utils/shiftUtils";

interface CalculateMachineEfficiencySnapshotParams {
  machine: Machine;
  now?: Date;
}

function getElapsedMinutes(startIso: string, end: Date): number {
  const elapsedMs = end.getTime() - new Date(startIso).getTime();
  if (Number.isNaN(elapsedMs) || elapsedMs < 0) return 0;
  return Math.floor(elapsedMs / 60000);
}

function getEfficiencyStatus(efficiencyPercent: number): MachineEfficiencySnapshot["status"] {
  if (efficiencyPercent < MINIMUM_EFFICIENCY_PERCENT) return "critical";
  if (efficiencyPercent < 85) return "warning";
  return "good";
}

export function calculateMachineEfficiencySnapshot({
  machine,
  now = new Date(),
}: CalculateMachineEfficiencySnapshotParams): MachineEfficiencySnapshot {
  const shiftType = getCurrentShiftType(now, machine.useCommercialShift);
  const { shiftStartedAt, shiftEndsAt } = getShiftWindow(now, shiftType);
  const config = SHIFT_CONFIGS[shiftType];
  const elapsedShiftMinutes = Math.min(config.totalMinutes, getElapsedMinutes(shiftStartedAt, now));
  const expectedProductionMinutesUntilNow = Math.min(
    config.productiveTargetMinutes,
    elapsedShiftMinutes,
  );

  if (machine.productionMode === "not_scheduled") {
    return {
      machineId: machine.id,
      shiftType,
      shiftLabel: getShiftLabel(shiftType),
      shiftStartedAt,
      shiftEndsAt,
      productiveTargetMinutes: config.productiveTargetMinutes,
      elapsedShiftMinutes,
      expectedProductionMinutesUntilNow,
      runningMinutes: expectedProductionMinutesUntilNow,
      stoppedFailureMinutes: 0,
      efficiencyPercent: 100,
      minimumEfficiencyPercent: MINIMUM_EFFICIENCY_PERCENT,
      status: "not_scheduled",
    };
  }

  const runningMinutes =
    machine.machineStatus === "running" ? expectedProductionMinutesUntilNow : 0;
  const stoppedFailureMinutes =
    machine.machineStatus === "stopped" ? expectedProductionMinutesUntilNow : 0;
  const efficiencyPercent =
    expectedProductionMinutesUntilNow === 0
      ? 100
      : Math.round((runningMinutes / expectedProductionMinutesUntilNow) * 100);

  return {
    machineId: machine.id,
    shiftType,
    shiftLabel: getShiftLabel(shiftType),
    shiftStartedAt,
    shiftEndsAt,
    productiveTargetMinutes: config.productiveTargetMinutes,
    elapsedShiftMinutes,
    expectedProductionMinutesUntilNow,
    runningMinutes,
    stoppedFailureMinutes,
    efficiencyPercent,
    minimumEfficiencyPercent: MINIMUM_EFFICIENCY_PERCENT,
    status: getEfficiencyStatus(efficiencyPercent),
  };
}
