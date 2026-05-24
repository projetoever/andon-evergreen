import type { ShiftConfig } from "@/types/settings";

const KEY = "andonShiftConfig";

export const DEFAULT_SHIFTS: ShiftConfig[] = [
  { id: "morning", name: "Manhã", startTime: "06:00", endTime: "14:00", active: true, crossesMidnight: false },
  { id: "afternoon", name: "Tarde", startTime: "14:00", endTime: "22:00", active: true, crossesMidnight: false },
  { id: "night", name: "Noite", startTime: "22:00", endTime: "06:00", active: true, crossesMidnight: true },
  { id: "business", name: "Comercial", startTime: "06:00", endTime: "16:00", active: true, crossesMidnight: false },
];

export function getShiftConfigs() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_SHIFTS;
  try { return JSON.parse(raw) as ShiftConfig[]; } catch { return DEFAULT_SHIFTS; }
}

export function saveShiftConfigs(configs: ShiftConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(configs));
}
