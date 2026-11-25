/** Shared visual styling for the existing Recharts-based ANDON BI.
 * Presentation only: chart colors and animations do not alter analytics values.
 */
export const biChartPalette = [
  "#38bdf8", "#f59e0b", "#10b981", "#a78bfa",
  "#fb7185", "#22d3ee", "#f97316",
] as const;

export const biChartTooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  color: "var(--popover-foreground)",
  borderRadius: 14,
  boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
  padding: "10px 12px",
  fontSize: 12,
};

/** Recharts colors tooltip items from each series by default, even if the container
 * uses a themed popover. Override both item and label text to preserve contrast in
 * dark/light mode; series colors remain visible on the plotted marks.
 */
export const biChartTooltipProps = {
  contentStyle: biChartTooltipStyle,
  itemStyle: {
    color: "var(--popover-foreground)",
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
  labelStyle: {
    color: "var(--popover-foreground)",
    fontWeight: 600,
    overflowWrap: "anywhere",
  },
} as const;

export const biChartTickStyle = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
};

export const biChartGridColor = "var(--border)";

/** SVG gradient IDs must be unique when many charts appear on the same dashboard. */
export function biChartGradientId(reactId: string, prefix: string) {
  return prefix + "-" + reactId.replace(/[^a-zA-Z0-9_-]/g, "");
}
