export type MachineStatus = "running" | "stopped";

export type StopSource = "manual_simulation" | "node_red";

export type ProductionMode = "scheduled" | "not_scheduled";

export type ShiftType = "A" | "B" | "C" | "HC";

export interface MachineStopEvent {
  id: string;
  machineId: string;
  stoppedAt: string;
  resumedAt: string | null;
  durationMinutes: number;
  source: StopSource;
  failureDescription?: string;
}

export interface MachineProductionEvent {
  id: string;
  machineId: string;
  productionMode: ProductionMode;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
}

export interface MachineEfficiencySnapshot {
  machineId: string;
  shiftType: ShiftType;
  shiftLabel: string;
  shiftStartedAt: string;
  shiftEndsAt: string;
  productiveTargetMinutes: number;
  elapsedShiftMinutes: number;
  expectedProductionMinutesUntilNow: number;
  runningMinutes: number;
  stoppedFailureMinutes: number;
  efficiencyPercent: number;
  minimumEfficiencyPercent: number;
  status: "good" | "warning" | "critical" | "not_scheduled";
}

export interface Machine {
  id: string;
  name: string;
  machineStatus: MachineStatus;
  andonStatus: import("./andon").AndonStatus;
  currentCallId: string | null;
  lastStatusChangedAt: string;
  stoppedAt: string | null;
  lastStopDurationMinutes: number;
  stopHistory: MachineStopEvent[];
  productionMode: ProductionMode;
  productionModeChangedAt: string;
  useCommercialShift: boolean;
  productionHistory: MachineProductionEvent[];
}
