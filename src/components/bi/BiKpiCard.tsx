import type { LucideIcon } from "lucide-react";

import type { AnalyticsMetricComparison } from "@/types/analytics";

type KpiTone = "amber" | "blue" | "red" | "green" | "neutral";
type TrendMeaning = "neutral" | "lowerBetter" | "higherBetter";

const TONE_CLASSES: Record<KpiTone, string> = {
  amber:
    "border-amber-500/30 border-t-2 border-t-amber-400 bg-gradient-to-br from-amber-500/[0.07] to-card",
  blue:
    "border-sky-500/30 border-t-2 border-t-sky-400 bg-gradient-to-br from-sky-500/[0.07] to-card",
  red:
    "border-red-500/30 border-t-2 border-t-red-500 bg-gradient-to-br from-red-500/[0.08] to-card",
  green:
    "border-emerald-500/30 border-t-2 border-t-emerald-400 bg-gradient-to-br from-emerald-500/[0.07] to-card",
  neutral: "border-border border-t-2 border-t-muted-foreground/40 bg-card",
};

const ICON_CLASSES: Record<KpiTone, string> = {
  amber: "text-amber-400",
  blue: "text-sky-400",
  red: "text-red-400",
  green: "text-emerald-400",
  neutral: "text-muted-foreground",
};

function trendClasses(
  metric: AnalyticsMetricComparison,
  meaning: TrendMeaning,
) {
  if (metric.direction === "flat" || metric.direction === "unavailable") {
    return "border-border bg-muted/40 text-muted-foreground";
  }

  if (meaning === "neutral") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }

  const upIsGood = meaning === "higherBetter";
  const isGood =
    (metric.direction === "up" && upIsGood) ||
    (metric.direction === "down" && !upIsGood);

  return isGood
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-red-500/30 bg-red-500/10 text-red-300";
}

function trendLabel(metric: AnalyticsMetricComparison) {
  if (metric.direction === "unavailable") return null;
  if (metric.direction === "new") return "novo vs anterior";
  if (metric.direction === "flat") return "estável";
  if (metric.deltaPercent === null) return null;

  const arrow = metric.direction === "up" ? "▲" : "▼";
  return `${arrow} ${Math.abs(metric.deltaPercent)}%`;
}

export function BiKpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  trend,
  trendMeaning = "neutral",
  sampleSize,
  tooltip,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: KpiTone;
  trend?: AnalyticsMetricComparison | null;
  trendMeaning?: TrendMeaning;
  sampleSize?: number;
  tooltip?: string;
}) {
  const comparisonLabel = trend ? trendLabel(trend) : null;
  const lowSample =
    typeof sampleSize === "number" && sampleSize > 0 && sampleSize < 5;

  return (
    <article
      className={`rounded-xl border p-4 shadow-sm ${TONE_CLASSES[tone]}`}
      title={tooltip}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${ICON_CLASSES[tone]}`} />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="text-3xl font-black tabular-nums">{value}</div>
        {comparisonLabel && trend && (
          <span
            className={`mb-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${trendClasses(
              trend,
              trendMeaning,
            )}`}
          >
            {comparisonLabel}
          </span>
        )}
      </div>

      <p className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">{detail}</p>

      {lowSample && (
        <span className="mt-2 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
          Baixa amostra
        </span>
      )}
    </article>
  );
}
