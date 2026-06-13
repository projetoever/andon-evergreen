import { APP_NAME } from "@/constants/appConstants";
import { DEFAULT_ALERT_RULES } from "@/constants/alertRules";
import type { AppSettings } from "@/types/settings";

export const DEFAULT_SETTINGS: AppSettings = {
  appName: APP_NAME,
  kioskMode: true,
  simulationMode: true,
  soundsEnabled: true,
  soundVolume: 0.8,
  alertRules: DEFAULT_ALERT_RULES,
  theme: {
    primaryColor: "#2E7D32",
    dangerColor: "#C62828",
    warningColor: "#FBC02D",
    successColor: "#2E7D32",
    neutralColor: "#37474F",
  },
};
