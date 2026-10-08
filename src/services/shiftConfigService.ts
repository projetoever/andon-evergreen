import { createAndonApiClient } from "@/api/andonApiClient";
import { CONFIGURED_DATA_MODE } from "@/config/dataMode";
import type { ShiftConfig } from "@/types/settings";

const apiClient = createAndonApiClient();

export const DEFAULT_SHIFTS: ShiftConfig[] = [
  { id: "morning", name: "Manhã", startTime: "06:00", endTime: "14:00", active: true, crossesMidnight: false },
  { id: "afternoon", name: "Tarde", startTime: "14:00", endTime: "22:00", active: true, crossesMidnight: false },
  { id: "night", name: "Noite", startTime: "22:00", endTime: "06:00", active: true, crossesMidnight: true },
  { id: "business", name: "Comercial", startTime: "06:00", endTime: "16:00", active: true, crossesMidnight: false },
];

let cachedShifts: ShiftConfig[] = DEFAULT_SHIFTS;

function normalizeShift(value: {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
}): ShiftConfig {
  return {
    ...value,
    crossesMidnight: value.endTime <= value.startTime,
  };
}

export function getShiftConfigs() {
  return cachedShifts;
}

export async function refreshShiftConfigs() {
  if (CONFIGURED_DATA_MODE === "local") return cachedShifts;

  const shifts = await apiClient.get<Array<{
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    active: boolean;
  }>>("/api/shifts");

  cachedShifts = shifts.map(normalizeShift);
  return cachedShifts;
}

export async function saveShiftConfig(config: ShiftConfig) {
  if (CONFIGURED_DATA_MODE === "local") {
    cachedShifts = cachedShifts.map((item) =>
      item.id === config.id ? { ...config } : item,
    );
    return config;
  }

  const updated = await apiClient.patch<{
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    active: boolean;
  }>(`/api/shifts/${encodeURIComponent(config.id)}`, {
    name: config.name,
    startTime: config.startTime,
    endTime: config.endTime,
    active: config.active,
  });

  const normalized = normalizeShift(updated);
  cachedShifts = cachedShifts.map((item) =>
    item.id === normalized.id ? normalized : item,
  );
  return normalized;
}
