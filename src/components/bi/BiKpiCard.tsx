import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { CircleHelp, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { AnalyticsMetricComparison } from "@/types/analytics";

type KpiTone = "amber" | "blue" | "red" | "green" | "neutral";
type TrendMeaning = "neutral" | "lowerBetter" | "higherBetter";

type BiKpiHelp = Readonly<{
  measure: string;
  formula: string;
  interpretation: string;
  whenUnavailable?: string;
}>;

const TONE_CLASSES: Record<KpiTone, string> = {
  amber:
    "border-amber-500/30 border-t-2 border-t-amber-400 bg-gradient-to-br from-amber-500/[0.07] to-card",
  blue: "border-sky-500/30 border-t-2 border-t-sky-400 bg-gradient-to-br from-sky-500/[0.07] to-card",
  red: "border-red-500/30 border-t-2 border-t-red-500 bg-gradient-to-br from-red-500/[0.08] to-card",
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

function trendClasses(metric: AnalyticsMetricComparison, meaning: TrendMeaning) {
  if (metric.direction === "flat" || metric.direction === "unavailable") {
    return "border-border bg-muted/40 text-muted-foreground";
  }

  if (meaning === "neutral") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-300";
  }

  const upIsGood = meaning === "higherBetter";
  const isGood =
    (metric.direction === "up" && upIsGood) || (metric.direction === "down" && !upIsGood);

  return isGood
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : "border-red-500/30 bg-red-500/10 text-red-300";
}

function trendLabel(metric: AnalyticsMetricComparison) {
  if (metric.direction === "unavailable") return null;
  if (metric.direction === "new") return ui("novo vs anterior");
  if (metric.direction === "flat") return ui("estável");
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
  help,
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
  help?: BiKpiHelp;
}) {
  useInterfaceLanguage();
  const comparisonLabel = trend ? trendLabel(trend) : null;
  const lowSample = typeof sampleSize === "number" && sampleSize > 0 && sampleSize < 5;

  return (
    <article className={`min-w-0 rounded-xl border p-3 lg:p-4 shadow-sm ${TONE_CLASSES[tone]}`} title={help ? undefined : tooltip}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 text-xs font-black uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {help && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={ui("Explicação do indicador: {0}", { 0: label })}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                aria-label={ui("Explicação do indicador: {0}", { 0: label })}
                className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto p-3"
              >
                <div className="space-y-3 text-xs leading-5">
                  <h3 className="text-sm font-black">{label}</h3>
                  <section>
                    <h4 className="font-bold text-foreground">{ui("O que mede")}</h4>
                    <p className="text-muted-foreground">{help.measure}</p>
                  </section>
                  <section>
                    <h4 className="font-bold text-foreground">{ui("Como é calculado")}</h4>
                    <p className="text-muted-foreground">{help.formula}</p>
                  </section>
                  <section>
                    <h4 className="font-bold text-foreground">{ui("Como interpretar")}</h4>
                    <p className="text-muted-foreground">{help.interpretation}</p>
                  </section>
                  {help.whenUnavailable && (
                    <section>
                      <h4 className="font-bold text-foreground">{ui("Quando fica indisponível")}</h4>
                      <p className="text-muted-foreground">{help.whenUnavailable}</p>
                    </section>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <Icon className={`h-4 w-4 shrink-0 ${ICON_CLASSES[tone]}`} aria-hidden="true" />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="break-words text-2xl lg:text-3xl font-black tabular-nums">{value}</div>
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
          {ui("Baixa amostra")}
        </span>
      )}
    </article>
  );
}
