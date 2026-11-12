/** HIST-05: all counters represent the SAME authorized, server-scoped
 * historical query, not the 25 rows currently visible in the UI.
 * Grouping on three small enums/flags avoids fetching individual records.
 */
export interface GlobalHistoryCountRow {
  status: string;
  category: string;
  isSystemTest: boolean;
  _count: { _all: number };
}

export interface GlobalHistorySummary {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byOrigin: { real: number; system: number };
}

export function summarizeScopedGlobalHistory(
  rows: readonly GlobalHistoryCountRow[],
): GlobalHistorySummary {
  const status = new Map<string, number>();
  const category = new Map<string, number>();
  let real = 0;
  let system = 0;

  for (const row of rows) {
    const count = row._count._all;
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("invalid_history_aggregate");
    status.set(row.status, (status.get(row.status) ?? 0) + count);
    category.set(row.category, (category.get(row.category) ?? 0) + count);
    if (row.isSystemTest) system += count;
    else real += count;
  }
  return {
    total: real + system,
    byStatus: [...status].map(([key, count]) => ({ status: key, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    byCategory: [...category].map(([key, count]) => ({ category: key, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    byOrigin: { real, system },
  };
}
