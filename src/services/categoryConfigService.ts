import type { AndonCategoryConfig } from "@/types/settings";

const KEY = "andonCategoryConfig";

export const DEFAULT_CATEGORIES: AndonCategoryConfig[] = [
  { id: "electrical", categoryGroup: "maintenance", displayName: "Elétrica", active: true },
  { id: "mechanical", categoryGroup: "maintenance", displayName: "Mecânica", active: true },
  { id: "hot_melt", categoryGroup: "maintenance", displayName: "Hot Melt", active: true },
  { id: "quality", categoryGroup: "production", displayName: "Qualidade", active: true },
  { id: "leadership", categoryGroup: "production", displayName: "Liderança", active: true },
];

export function getCategoryConfigs() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_CATEGORIES;
  try { return JSON.parse(raw) as AndonCategoryConfig[]; } catch { return DEFAULT_CATEGORIES; }
}

export function saveCategoryConfigs(configs: AndonCategoryConfig[]) {
  localStorage.setItem(KEY, JSON.stringify(configs));
}
