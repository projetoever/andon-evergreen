import type { GlobalHistoryPeriod, GlobalHistorySearchFilters } from "@/services/globalHistoryService";

export function dateRangeForGlobalHistory(
  period: GlobalHistoryPeriod,
  customDate: string,
  now = new Date(),
  timeFrom = "",
  timeBefore = "",
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

  // Hour filtering is defined only for one explicit local-calendar day.
  // Convert the local instants to ISO before calling the scoped backend.
  if (period === "custom" && (timeFrom || timeBefore)) {
    const parseClock = (value: string, fallback: [number, number]) => {
      if (!value) return fallback;
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
        throw new Error("Informe um horário válido.");
      const [hour, minute] = value.split(":").map(Number);
      return [hour, minute] as [number, number];
    };
    if (timeFrom && timeBefore && timeFrom === timeBefore)
      throw new Error("Informe horários inicial e final diferentes.");
    const [startHour, startMinute] = parseClock(timeFrom, [0, 0]);
    const [endHour, endMinute] = parseClock(timeBefore, [0, 0]);
    const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour, startMinute);
    const before = timeBefore
      ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour, endMinute)
      : end;
    // A night shift can start at 22:00 and end at 06:00 the next day.
    if (timeBefore && before <= from) before.setDate(before.getDate() + 1);
    return { openedFrom: from.toISOString(), openedBefore: before.toISOString() };
  }
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
  const range = dateRangeForGlobalHistory(
    filters.period, filters.customDate, now, filters.timeFrom ?? "", filters.timeBefore ?? "",
  );
  if (range.openedFrom) params.set("openedFrom", range.openedFrom);
  if (range.openedBefore) params.set("openedBefore", range.openedBefore);
  params.set("limit", "25");
  params.set("offset", String(offset));
  return "/api/andon-calls/history/search?" + params.toString();
}


/** Summary must use the same filter set, but must NEVER inherit UI pagination.
 * Totals are computed over the full authorized filtered history by the API.
 */
export function globalHistorySummaryPath(
  filters: GlobalHistorySearchFilters,
  now = new Date(),
) {
  const path = globalHistorySearchPath(filters, 0, now);
  const [base, query] = path.split("?");
  if (base !== "/api/andon-calls/history/search" || !query)
    throw new Error("invalid_history_summary_path");
  const params = new URLSearchParams(query);
  params.delete("limit");
  params.delete("offset");
  return "/api/andon-calls/history/summary?" + params.toString();
}
