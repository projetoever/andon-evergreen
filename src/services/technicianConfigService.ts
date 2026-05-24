import { TECHNICIANS } from "@/data/technicians";
import type { TechnicianConfig } from "@/types/settings";

const KEY = "andonTechniciansConfig";

function getDefaultConfigs(): TechnicianConfig[] {
  return TECHNICIANS.map((t) => ({ id: t.id, name: t.name, area: t.area, shifts: [], active: t.active }));
}

export function getTechnicianConfigs() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [] as TechnicianConfig[];
  try { return JSON.parse(raw) as TechnicianConfig[]; } catch { return []; }
}

export function saveTechnicianConfigs(configs: TechnicianConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(configs));
}

export function getTechniciansForSelector(area: string) {
  const configured = getTechnicianConfigs().filter((t) => t.active && t.area === area);
  if (configured.length > 0) return configured;
  return getDefaultConfigs().filter((t) => t.active && t.area === area);
}
