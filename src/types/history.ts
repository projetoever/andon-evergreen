import type { Machine } from "./machine";
import type { AndonCall } from "./andon";
import type { AppSettings, SoundConfig } from "./settings";

export interface DashboardSummary {
  totalMachines: number;
  runningMachines: number;
  stoppedMachines: number;
  openCalls: number;
  inProgressCalls: number;
  finishedCallsToday: number;
  criticalCalls: number;
  notScheduledMachines: number;
}

export interface AppBackup {
  exportedAt: string;
  appVersion: string;
  machines: Machine[];
  calls: AndonCall[];
  settings: AppSettings;
  soundConfigs: SoundConfig[];
}
