import { andonBiApiClient } from "@/api/andonBiApiClient";
import type {
  AnalyticsOverview,
  AndonBiClassificationOption,
  AndonBiFilterOptions,
  AndonBiFilters,
  AndonBiMachineOption,
  AndonBiPeriodPreset,
  AndonBiSectorOption,
} from "@/types/analytics";

type ApiHealth = {
  status: string;
  timestamp: string;
  timeZone?: string;
};

const PERIOD_HOURS: Record<AndonBiPeriodPreset, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export function buildRollingPeriod(serverTimestamp: string, preset: AndonBiPeriodPreset) {
  const end = new Date(serverTimestamp);
  if (Number.isNaN(end.getTime())) {
    throw new Error("Horário autoritativo do servidor inválido.");
  }

  const start = new Date(end.getTime() - PERIOD_HOURS[preset] * 60 * 60 * 1000);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

export async function loadAndonBiFilterOptions(): Promise<AndonBiFilterOptions> {
  const [machines, sectors, classifications] = await Promise.all([
    andonBiApiClient.get<AndonBiMachineOption[]>("/api/machines?includeInactive=true"),
    andonBiApiClient.get<AndonBiSectorOption[]>("/api/andon-categories"),
    andonBiApiClient.get<AndonBiClassificationOption[]>("/api/failure-classifications"),
  ]);

  return {
    machines: [...machines].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR", { numeric: true }),
    ),
    sectors: [...sectors].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "pt-BR"),
    ),
    classifications: [...classifications].sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    ),
  };
}

export async function loadExecutiveOverview(
  filters: AndonBiFilters,
): Promise<AnalyticsOverview> {
  const health = await andonBiApiClient.get<ApiHealth>("/health");
  const period = buildRollingPeriod(health.timestamp, filters.period);
  const query = new URLSearchParams({
    startDate: period.startDate,
    endDate: period.endDate,
  });

  if (filters.machineId) query.set("machineId", filters.machineId);
  if (filters.subtype) query.set("subtype", filters.subtype);
  if (filters.classification) query.set("classification", filters.classification);

  return andonBiApiClient.get<AnalyticsOverview>(
    `/api/analytics/overview?${query.toString()}`,
  );
}
