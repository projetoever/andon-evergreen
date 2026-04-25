import type { SoundKey } from "./andon";

export interface AlertRules {
  callOpenWarningMinutes: number;
  callOpenCriticalMinutes: number;
  machineStoppedWarningMinutes: number;
  machineStoppedCriticalMinutes: number;
}

export interface ThemeSettings {
  primaryColor: string;
  dangerColor: string;
  warningColor: string;
  successColor: string;
  neutralColor: string;
}

export interface AppSettings {
  appName: string;
  kioskMode: boolean;
  simulationMode: boolean;
  soundsEnabled: boolean;
  soundVolume: number;
  alertRules: AlertRules;
  theme: ThemeSettings;
}

export interface SoundConfig {
  key: SoundKey;
  label: string;
  fileName: string;
  enabled: boolean;
  repeatUntilAttended: boolean;
  repeatIntervalSeconds: number;
}
