import type { GlobalHistoryPeriod, GlobalHistorySearchFilters } from "@/services/globalHistoryService";

export function dateRangeForGlobalHistory(
  period: GlobalHistoryPeriod,
  customDate: string,
  now = new Date(),
): { openedFrom?: string; openedBefore?: string } {
  if (period === "all") return {};
  let day: Date;
  if (period === "custom") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate))
      throw new Error("Selecione uma data válida.");
    const [y,m,d] = customDate.split("-").map(Number);
    day = new Date(y, m - 1, d);
    if (day.getFullYear() !== y || day.getMonth() + 1 !== m || day.getDate() !== d)
      throw new Error("Selecione uma data válida.");
  } else {
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (period === "7d" || period === "30d")
    start.setDate(start.getDate() - (period === "7d" ? 6 : 29));
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  end.setDate(end.getDate() + 1);
  return { openedFrom: start.toISOString(), openedBefore: end.toISOString() };
}

/** URL encoding is for filters only: authorization is bound by the SERVER's
 * authenticated session/workstation and SQL machineScope before pagination.
 */
export function globalHistorySearchPath(
  filters: GlobalHistorySearchFilters,
  offset = 0,
  now = new Date(),
) {
  const params = new URLSearchParams();
  const add = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  };
  add("query", filters.query);
  if (filters.machineId !== "all") add("machineId", filters.machineId);
  if (filters.status !== "all") add("status", filters.status);
  if (filters.origin !== "all") add("origin", filters.origin);
  add("subtype", filters.subtype);
  add("technician", filters.technician);
  add("failureClassification", filters.failureClassification);
  add("reasonId", filters.reasonId);
  const range = dateRangeForGlobalHistory(filters.period, filters.customDate, now);
  if (range.openedFrom) params.set("openedFrom", range.openedFrom);
  if (range.openedBefore) params.set("openedBefore", range.openedBefore);
  params.set("limit", "25");
  params.set("offset", String(offset));
  return "/api/andon-calls/history/search?" + params.toString();
}

