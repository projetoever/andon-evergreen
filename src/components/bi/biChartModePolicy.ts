/** Presentation-only policy: never alter BI snapshots, samples or formulas. */
export type BiChartMode = "bars" | "line" | "area" | "donut" | "pie" | "pareto";
export type BiChartKind = "temporal" | "categorical" | "distribution";
export type BiChartDatum = { id: string; label: string; value: number | null };
export function availableBiChartModes(rows: readonly BiChartDatum[], unit: "minutes" | "percent" | "count", kind: BiChartKind): BiChartMode[] {
  const modes: BiChartMode[] = ["bars"];
  const valid = rows.filter(row => row.value !== null && Number.isFinite(row.value));
  if (kind === "temporal") {
    if (valid.length >= 2) modes.push("line", "area");
    return modes;
  }
  if (unit === "percent" || valid.length < 2 || valid.length !== rows.length ||
      valid.some(row => (row.value ?? 0) < 0) ||
      valid.reduce((total, row) => total + (row.value ?? 0), 0) <= 0) return modes;
  modes.push("pareto");
  if (valid.length <= 7 && valid.filter(row => (row.value ?? 0) > 0).length >= 2) modes.push("donut", "pie");
  return modes;
}
export function biParetoRows<T extends BiChartDatum>(rows: readonly T[]) {
  const sorted = [...rows].sort((a,b) => (b.value ?? 0) - (a.value ?? 0));
  const total = sorted.reduce((sum, row) => sum + (row.value ?? 0), 0);
  let accum = 0;
  return sorted.map(row => {
    accum += row.value ?? 0;
    return { ...row, cumulativePercent: total > 0 ? Math.round((accum / total) * 10_000) / 100 : 0 };
  });
}
