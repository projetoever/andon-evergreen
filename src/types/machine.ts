export type MachineStatus = "running" | "stopped";

export type StopSource = "manual_simulation" | "node_red";

export interface MachineStopEvent {
  id: string;
  machineId: string;
  stoppedAt: string;
  resumedAt: string | null;
  durationMinutes: number;
  source: StopSource;
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
}
