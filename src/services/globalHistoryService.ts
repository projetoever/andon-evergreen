import { createAndonApiClient } from "@/api/andonApiClient";
import { globalHistorySearchPath } from "@/utils/globalHistoryQuery";
export { globalHistorySearchPath, dateRangeForGlobalHistory } from "@/utils/globalHistoryQuery";

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

/** Static reference catalogs, not live call records. The server still
 * authorizes these GETs via the current user's operational module grant.
 */
export interface GlobalHistoryCategoryOption {
  id: string;
  displayName: string;
  active: boolean;
}
export interface GlobalHistoryClassificationOption {
  value: string;
  label: string;
  active: boolean;
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

export function searchGlobalHistory(filters: GlobalHistorySearchFilters, offset: number) {
  return api.get<GlobalHistorySearchResult>(globalHistorySearchPath(filters, offset));
}

export function listAuthorizedHistoryMachines() {
  return api.get<AuthorizedHistoryMachine[]>("/api/machines");
}

export function listGlobalHistoryCategoryOptions() {
  return api.get<GlobalHistoryCategoryOption[]>("/api/andon-categories");
}
export function listGlobalHistoryClassificationOptions() {
  return api.get<GlobalHistoryClassificationOption[]>("/api/failure-classifications");
}
