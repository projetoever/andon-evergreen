import type { AndonCall, AndonStatus } from "@/types/andon";

export type CallHistoryPeriod = "all" | "today" | "7d" | "30d" | "custom";
export type CallHistoryOrigin = "all" | "real" | "system";
/** Legacy machine history sorts by completion/activity. The Global History
 * chronological list explicitly requests openedAt; never change the legacy
 * default silently or apply pagination before sorting.
 */
export type CallHistorySort = "activity" | "openedAt";

export interface GlobalCallHistoryFilters extends CallHistoryFilters {
  /** Selected machine in the ALREADY AUTHORIZED result; all means no extra
   * DISPLAY filtering. This is never an access-control substitute.
   */
  machineId: string;
}


export interface CallHistoryFailureDetails {
  classification?: string | null;
  description?: string | null;
}

export interface CallHistoryFilters {
  query: string;
  subtype: string;
  status: "all" | AndonStatus;
  technician: string;
  failureClassification: string;
  period: CallHistoryPeriod;
  customDate: string;
  origin: CallHistoryOrigin;
}

export const DEFAULT_CALL_HISTORY_FILTERS: CallHistoryFilters = {
  query: "",
  subtype: "all",
  status: "all",
  technician: "all",
  failureClassification: "all",
  period: "all",
  customDate: "",
  origin: "all",
};

export const DEFAULT_GLOBAL_CALL_HISTORY_FILTERS: GlobalCallHistoryFilters = {
  ...DEFAULT_CALL_HISTORY_FILTERS,
  machineId: "all",
};


function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function toLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function callMatchesPeriod(
  call: AndonCall,
  period: CallHistoryPeriod,
  customDate: string,
  now: Date,
) {
  if (period === "all") return true;

  const openedAt = new Date(call.openedAt);
  if (Number.isNaN(openedAt.getTime())) return false;

  if (period === "custom") {
    return Boolean(customDate) && toLocalDateKey(openedAt) === customDate;
  }

  const today = startOfLocalDay(now);
  const callDay = startOfLocalDay(openedAt);

  if (period === "today") return callDay.getTime() === today.getTime();

  const days = period === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  return callDay.getTime() >= start.getTime() && callDay.getTime() <= today.getTime();
}

function getTechnicianNames(call: AndonCall) {
  return Array.from(
    new Set(
      [
        ...(call.technicianNames ?? []),
        call.technicianName,
        ...(call.technicianSessions ?? []).map((session) => session.technicianName),
      ]
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );
}

function callMatchesQuery(
  call: AndonCall,
  query: string,
  failureDetails?: CallHistoryFailureDetails,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const searchableValues = [
    call.workOrderNumber,
    call.id,
    call.subtype,
    call.failureClassification,
    call.failureDescription,
    failureDetails?.classification,
    failureDetails?.description,
    call.notes,
    call.machineSetCodeSnapshot,
    call.machineSetNameSnapshot,
    call.machineSubsetCodeSnapshot,
    call.machineSubsetNameSnapshot,
    call.confirmedMachineSetCodeSnapshot,
    call.confirmedMachineSetNameSnapshot,
    call.confirmedMachineSubsetCodeSnapshot,
    call.confirmedMachineSubsetNameSnapshot,
    ...getTechnicianNames(call),
  ];

  return searchableValues.some((value) =>
    normalizeSearchText(value).includes(normalizedQuery),
  );
}

export function listCallHistoryTechnicians(calls: AndonCall[]) {
  return Array.from(new Set(calls.flatMap(getTechnicianNames))).sort((current, next) =>
    current.localeCompare(next, "pt-BR", { sensitivity: "base" }),
  );
}

export function filterCallHistory(
  calls: AndonCall[],
  filters: CallHistoryFilters,
  failureDetailsByCallId: ReadonlyMap<string, CallHistoryFailureDetails> = new Map(),
  now = new Date(),
  sortBy: CallHistorySort = "activity",
) {
  return calls
    .filter((call) => {
      const failureDetails = failureDetailsByCallId.get(call.id);

      if (!callMatchesQuery(call, filters.query, failureDetails)) return false;
      if (filters.subtype !== "all" && call.subtype !== filters.subtype) return false;
      if (filters.status !== "all" && call.status !== filters.status) return false;

      if (
        filters.technician !== "all" &&
        !getTechnicianNames(call).includes(filters.technician)
      ) {
        return false;
      }

      if (filters.failureClassification !== "all") {
        const classification =
          failureDetails?.classification ?? call.failureClassification ?? "";
        if (classification !== filters.failureClassification) return false;
      }

      if (filters.origin === "real" && call.isSystemTest) return false;
      if (filters.origin === "system" && !call.isSystemTest) return false;

      return callMatchesPeriod(call, filters.period, filters.customDate, now);
    })
    .slice()
    .sort((current, next) => compareCallHistoryChronology(current, next, sortBy));
}

/** Dates in server payloads are ISO instants. Invalid legacy dates belong at
 * the end of the list; a deterministic ID tie-breaker stabilizes selection
 * and cursor pagination as other calls are completed out of order.
 */
export function compareCallHistoryChronology(
  first: Pick<AndonCall, "id" | "openedAt" | "finishedAt" | "updatedAt">,
  second: Pick<AndonCall, "id" | "openedAt" | "finishedAt" | "updatedAt">,
  sortBy: CallHistorySort,
): number {
  const when = (call: typeof first) =>
    sortBy === "openedAt" ? call.openedAt : call.finishedAt ?? call.openedAt;
  const timestamp = (value: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
  };
  const delta = timestamp(when(second)) - timestamp(when(first));
  return delta || first.id.localeCompare(second.id);
}

/** The Global History left column reuses all existing machine-history filters.
 * IMPORTANT: the API MUST restrict machineScope and filter/paginate in SQL
 * BEFORE passing a page to the browser. This function adds only visual
 * filtering on already-authorized rows and cannot confer data access.
 */
export function filterGlobalCallHistory(
  scopedCalls: AndonCall[],
  filters: GlobalCallHistoryFilters,
  failureDetailsByCallId: ReadonlyMap<string, CallHistoryFailureDetails> = new Map(),
  now = new Date(),
): AndonCall[] {
  const visible = filters.machineId === "all"
    ? scopedCalls
    : scopedCalls.filter(call => call.machineId === filters.machineId);
  return filterCallHistory(visible, filters, failureDetailsByCallId, now, "openedAt");
}

export function hasActiveGlobalCallHistoryFilters(filters: GlobalCallHistoryFilters) {
  return filters.machineId !== "all" || hasActiveCallHistoryFilters(filters);
}

export function hasActiveCallHistoryFilters(filters: CallHistoryFilters) {
  return (
    filters.query.trim().length > 0 ||
    filters.subtype !== "all" ||
    filters.status !== "all" ||
    filters.technician !== "all" ||
    filters.failureClassification !== "all" ||
    filters.period !== "all" ||
    filters.origin !== "all"
  );
}
