import { TECHNICIANS } from "@/data/technicians";
import type { TechnicianConfig } from "@/types/settings";

const KEY = "andonTechniciansConfig";

function normalizeTechnicianConfig(config: Partial<TechnicianConfig>): TechnicianConfig {
  const legacyShiftIds = Array.isArray(config.shiftIds)
    ? config.shiftIds
    : Array.isArray((config as { shifts?: string[] }).shifts)
      ? (config as { shifts?: string[] }).shifts
      : [];
  const shiftId = config.shiftId ?? legacyShiftIds[0] ?? "";

  return {
    id: config.id ?? "",
    name: config.name ?? "",
    area: (config.area ?? "electrical") as TechnicianConfig["area"],
    shiftId,
    shiftIds: legacyShiftIds,
    active: config.active ?? true,
  };
}

function getDefaultConfigs(): TechnicianConfig[] {
  return TECHNICIANS.map((t) => ({ id: t.id, name: t.name, area: t.area, shiftId: "", shiftIds: [], active: t.active }));
}

export function getTechnicianConfigs() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [] as TechnicianConfig[];
  try {
    const parsed = JSON.parse(raw) as Partial<TechnicianConfig>[];
    return parsed.map(normalizeTechnicianConfig);
  } catch {
    return [];
  }
}

export function saveTechnicianConfigs(configs: TechnicianConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(configs));
}

export function getActiveTechniciansForArea(area: string): TechnicianConfig[] {
  const configured = getTechnicianConfigs().filter((t) => t.active && t.area === area);
  if (configured.length > 0) return configured;
  return getDefaultConfigs().filter((t) => t.active && t.area === area);
}
