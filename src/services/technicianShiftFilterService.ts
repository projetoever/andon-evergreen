import { getShiftConfigs } from "@/services/shiftConfigService";
import type { ShiftConfig, TechnicianShiftFilterConfig } from "@/types/settings";

const KEY = "andonTechnicianShiftFilterConfig";
const SHIFT_PRIORITY = ["morning", "afternoon", "night", "business"];

const DEFAULT_CONFIG: TechnicianShiftFilterConfig = {
  filterByCurrentShift: true,
};

function parseMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isTimeInShift(shift: ShiftConfig, currentMinutes: number): boolean {
  const startMinutes = parseMinutes(shift.startTime);
  const endMinutes = parseMinutes(shift.endTime);
  const crossesMidnight = shift.crossesMidnight || endMinutes <= startMinutes;

  if (crossesMidnight) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function getCurrentShift(shifts: ShiftConfig[], date = new Date()): ShiftConfig | null {
  const activeShifts = shifts.filter((shift) => shift.active);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const sorted = [...activeShifts].sort((a, b) => {
    const aPriority = SHIFT_PRIORITY.indexOf(a.id);
    const bPriority = SHIFT_PRIORITY.indexOf(b.id);
    return (aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority) - (bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority);
  });

  return sorted.find((shift) => isTimeInShift(shift, currentMinutes)) ?? null;
}

export function getTechnicianShiftFilterConfig(): TechnicianShiftFilterConfig {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<TechnicianShiftFilterConfig>;
    return {
      filterByCurrentShift: parsed.filterByCurrentShift ?? DEFAULT_CONFIG.filterByCurrentShift,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveTechnicianShiftFilterConfig(config: TechnicianShiftFilterConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function getCurrentShiftFromConfig(date = new Date()): ShiftConfig | null {
  return getCurrentShift(getShiftConfigs(), date);
}
