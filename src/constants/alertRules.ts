import type { AlertRules } from "@/types/settings";

export const DEFAULT_ALERT_RULES: AlertRules = {
  callOpenWarningMinutes: 5,
  callOpenCriticalMinutes: 10,
  machineStoppedWarningMinutes: 10,
  machineStoppedCriticalMinutes: 15,
};
