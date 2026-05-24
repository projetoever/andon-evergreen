import type { CallSubtype, TechnicianArea } from "./andon";
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

export interface AdminSession {
  isAuthenticated: boolean;
}

export type SettingsTab = "sounds" | "technicians" | "categories" | "shifts";

export interface TechnicianConfig {
  id: string;
  name: string;
  area: CallSubtype;
  shifts: string[];
  active: boolean;
}

export interface ShiftConfig {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
  crossesMidnight: boolean;
}

export interface AndonCategoryConfig {
  id: CallSubtype;
  categoryGroup: "maintenance" | "production";
  displayName: string;
  active: boolean;
}

export interface TechnicianCategory {
  id: TechnicianArea | "quality" | "leadership";
  label: string;
}
