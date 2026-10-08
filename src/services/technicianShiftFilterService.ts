import { getShiftConfigs } from "@/services/shiftConfigService";
import {
  getSystemSettings,
  updateSystemSettings,
} from "@/services/systemSettingsService";
import type { ShiftConfig, TechnicianShiftFilterConfig } from "@/types/settings";
import { getServerNow, getServerTimeZone, isServerClockSynchronized } from "@/utils/serverClock";

const SHIFT_PRIORITY = ["morning", "afternoon", "night", "business"];

const DEFAULT_CONFIG: TechnicianShiftFilterConfig = {
  filterByCurrentShift: true,
};

let cachedConfig: TechnicianShiftFilterConfig = DEFAULT_CONFIG;

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

function getMinutesAtTimeZone(date: Date, timeZone?: string | null): number {
  if (!timeZone) return date.getHours() * 60 + date.getMinutes();
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(date);
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}

export function getCurrentShift(
  shifts: ShiftConfig[],
  date = new Date(),
  timeZone?: string | null,
): ShiftConfig | null {
  const activeShifts = shifts.filter((shift) => shift.active);
  const currentMinutes = getMinutesAtTimeZone(date, timeZone);
  const sorted = [...activeShifts].sort((a, b) => {
    const aPriority = SHIFT_PRIORITY.indexOf(a.id);
    const bPriority = SHIFT_PRIORITY.indexOf(b.id);
    return (
      (aPriority === -1 ? Number.MAX_SAFE_INTEGER : aPriority) -
      (bPriority === -1 ? Number.MAX_SAFE_INTEGER : bPriority)
    );
  });

  return sorted.find((shift) => isTimeInShift(shift, currentMinutes)) ?? null;
}

export function getTechnicianShiftFilterConfig(): TechnicianShiftFilterConfig {
  return cachedConfig;
}

export async function refreshTechnicianShiftFilterConfig() {
  const settings = await getSystemSettings();
  cachedConfig = {
    filterByCurrentShift: settings.filterTechniciansByCurrentShift,
    updatedAt: settings.updatedAt,
  };
  return cachedConfig;
}

export async function saveTechnicianShiftFilterConfig(
  config: TechnicianShiftFilterConfig,
) {
  const settings = await updateSystemSettings({
    filterTechniciansByCurrentShift: config.filterByCurrentShift,
  });
  cachedConfig = {
    filterByCurrentShift: settings.filterTechniciansByCurrentShift,
    updatedAt: settings.updatedAt,
  };
  return cachedConfig;
}

export function getCurrentShiftFromConfig(date?: Date): ShiftConfig | null {
  if (date) return getCurrentShift(getShiftConfigs(), date);
  if (!isServerClockSynchronized()) return null;
  return getCurrentShift(getShiftConfigs(), getServerNow(), getServerTimeZone());
}
