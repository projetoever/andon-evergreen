import { SHIFT_CONFIGS } from "@/constants/shiftRules";
import type { ShiftType } from "@/types/machine";

const MINUTES_PER_DAY = 24 * 60;

function getMinutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseTimeMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function setDateTime(date: Date, minutesSinceMidnight: number): Date {
  const next = new Date(date);
  next.setHours(Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0);
  return next;
}

export function isCommercialShiftAvailable(date: Date): boolean {
  const minutes = getMinutesSinceMidnight(date);
  return (
    minutes >= parseTimeMinutes(SHIFT_CONFIGS.HC.startTime) &&
    minutes < parseTimeMinutes(SHIFT_CONFIGS.HC.endTime)
  );
}

export function getCurrentShiftType(date: Date, useCommercialShift: boolean): ShiftType {
  if (useCommercialShift && isCommercialShiftAvailable(date)) return "HC";

  const minutes = getMinutesSinceMidnight(date);
  if (
    minutes >= parseTimeMinutes(SHIFT_CONFIGS.A.startTime) &&
    minutes < parseTimeMinutes(SHIFT_CONFIGS.A.endTime)
  ) {
    return "A";
  }
  if (
    minutes >= parseTimeMinutes(SHIFT_CONFIGS.B.startTime) &&
    minutes < parseTimeMinutes(SHIFT_CONFIGS.B.endTime)
  ) {
    return "B";
  }
  return "C";
}

export function getShiftWindow(
  date: Date,
  shiftType: ShiftType,
): { shiftStartedAt: string; shiftEndsAt: string } {
  const config = SHIFT_CONFIGS[shiftType];
  const startMinutes = parseTimeMinutes(config.startTime);
  const endMinutes = parseTimeMinutes(config.endTime);
  const currentMinutes = getMinutesSinceMidnight(date);
  const crossesMidnight = endMinutes <= startMinutes;
  const start = setDateTime(date, startMinutes);
  const end = setDateTime(date, endMinutes);

  if (crossesMidnight) {
    if (currentMinutes < endMinutes) {
      start.setDate(start.getDate() - 1);
    } else {
      end.setDate(end.getDate() + 1);
    }
  }

  if (!crossesMidnight && currentMinutes < startMinutes) {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  }

  if (!crossesMidnight && currentMinutes >= endMinutes) {
    start.setDate(start.getDate() + 1);
    end.setDate(end.getDate() + 1);
  }

  if (crossesMidnight && end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + MINUTES_PER_DAY * 60000);
  }

  return { shiftStartedAt: start.toISOString(), shiftEndsAt: end.toISOString() };
}

export function getShiftLabel(shiftType: ShiftType): string {
  return SHIFT_CONFIGS[shiftType].label;
}
