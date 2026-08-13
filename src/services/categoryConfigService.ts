import { createAndonApiClient } from "@/api/andonApiClient";
import { replaceCallTypeOptions } from "@/data/callTypes";
import type { CallTypeOption } from "@/types/andon";
import type { AndonCategoryConfig } from "@/types/settings";

const apiClient = createAndonApiClient();

export const DEFAULT_CATEGORIES: AndonCategoryConfig[] = [
  {
    id: "electrical",
    categoryGroup: "maintenance",
    displayName: "Elétrica",
    color: "#F5B700",
    active: true,
    displayOrder: 10,
  },
  {
    id: "mechanical",
    categoryGroup: "maintenance",
    displayName: "Mecânica",
    color: "#F59E0B",
    active: true,
    displayOrder: 20,
  },
  {
    id: "hot_melt",
    categoryGroup: "maintenance",
    displayName: "Hot Melt",
    color: "#F97316",
    active: true,
    displayOrder: 30,
  },
  {
    id: "quality",
    categoryGroup: "production",
    displayName: "Qualidade",
    color: "#0EA5E9",
    active: true,
    displayOrder: 40,
  },
  {
    id: "leadership",
    categoryGroup: "production",
    displayName: "Liderança",
    color: "#8B5CF6",
    active: true,
    displayOrder: 50,
  },
];

function toCallTypeOption(category: AndonCategoryConfig): CallTypeOption {
  return {
    id: category.id,
    label: category.displayName,
    category: category.categoryGroup,
    technicianArea: category.categoryGroup === "maintenance" ? category.id : null,
    soundKey: category.id,
    colorClass:
      category.categoryGroup === "maintenance"
        ? "bg-warning text-warning-foreground"
        : "bg-info text-info-foreground",
    color: category.color,
    active: category.active,
    displayOrder: category.displayOrder,
  };
}

function updateRuntimeOptions(categories: AndonCategoryConfig[]) {
  replaceCallTypeOptions(categories.map(toCallTypeOption));
  return categories;
}

export async function getCategoryConfigs(options: { activeOnly?: boolean } = {}) {
  const query = options.activeOnly ? "?active=true" : "";
  const categories = await apiClient.get<AndonCategoryConfig[]>(`/api/andon-categories${query}`);
  return options.activeOnly ? categories : updateRuntimeOptions(categories);
}

export async function createCategoryConfig(
  category: Omit<AndonCategoryConfig, "createdAt" | "updatedAt">,
) {
  const created = await apiClient.post<AndonCategoryConfig>("/api/andon-categories", category);
  await getCategoryConfigs();
  return created;
}

export async function updateCategoryConfig(
  id: string,
  patch: Partial<Omit<AndonCategoryConfig, "id" | "createdAt" | "updatedAt">>,
) {
  const updated = await apiClient.patch<AndonCategoryConfig>(
    `/api/andon-categories/${encodeURIComponent(id)}`,
    patch,
  );
  await getCategoryConfigs();
  return updated;
}

export async function deleteCategoryConfig(id: string) {
  await apiClient.delete<void>(`/api/andon-categories/${encodeURIComponent(id)}`);
  await getCategoryConfigs();
}
