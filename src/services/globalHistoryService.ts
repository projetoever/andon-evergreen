import { createAndonApiClient } from "@/api/andonApiClient";

const api = createAndonApiClient();

export interface GlobalHistoryCallSummary {
  id: string;
  machineId: string;
  machine: { name: string };
  category: string;
  subtype: string | null;
  status: string;
  criticality: string;
  workOrderNumber: string | null;
  failureClassification: string | null;
  technicianName: string | null;
  technicianNames: string[];
  isSystemTest: boolean;
  openedAt: string;
  finishedAt: string | null;
  updatedAt: string;
  callReasonSnapshot: {
    reasonId: string;
    reasonNameSnapshot: string;
    optionId: string;
    optionNameSnapshot: string;
    nature: string;
  } | null;
}

export interface GlobalHistorySearchResult {
  items: GlobalHistoryCallSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface AuthorizedHistoryMachine {
  id: string;
  name: string;
}

export type GlobalHistoryPeriod = "all" | "today" | "7d" | "30d" | "custom";

export interface GlobalHistorySearchFilters {
  query: string;
  machineId: string;
  subtype: string;
  status: string;
  technician: string;
  failureClassification: string;
  reasonId: string;
  origin: "all" | "real" | "system";
  period: GlobalHistoryPeriod;
  customDate: string;
}

export const DEFAULT_GLOBAL_HISTORY_SEARCH_FILTERS: GlobalHistorySearchFilters = {
  query: "",
  machineId: "all",
  subtype: "",
  status: "all",
  technician: "",
  failureClassification: "",
  reasonId: "",
  origin: "all",
  period: "30d",
  customDate: "",
};

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

export function searchGlobalHistory(filters: GlobalHistorySearchFilters, offset: number) {
  return api.get<GlobalHistorySearchResult>(globalHistorySearchPath(filters, offset));
}

export function listAuthorizedHistoryMachines() {
  return api.get<AuthorizedHistoryMachine[]>("/api/machines");
}
