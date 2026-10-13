import type {
  AnalyticsMetricComparison,
  AnalyticsOverview,
} from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function comparisonSentence(
  label: string,
  metric: AnalyticsMetricComparison,
  formatter: (value: number | null) => string = (value) => String(value ?? "—"),
) {
  if (metric.direction === "unavailable") {
    return `${label}: comparação indisponível por falta de amostra equivalente.`;
  }
  if (metric.direction === "new") {
    return `${label}: o período anterior estava em zero; o atual registra ${formatter(metric.current)}.`;
  }
  if (metric.direction === "flat") {
    return `${label}: estável em ${formatter(metric.current)} frente ao período anterior.`;
  }

  const verb = metric.direction === "up" ? "subiu" : "caiu";
  return `${label}: ${verb} ${Math.abs(metric.deltaPercent ?? 0)}% frente ao período anterior (${formatter(metric.previous)} → ${formatter(metric.current)}).`;
}

type SummaryTone = "red" | "amber" | "green" | "blue";

const TONE_CLASSES: Record<SummaryTone, string> = {
  red: "border-red-500/30 bg-red-500/[0.05]",
  amber: "border-amber-500/30 bg-amber-500/[0.05]",
  green: "border-emerald-500/30 bg-emerald-500/[0.05]",
  blue: "border-sky-500/30 bg-sky-500/[0.05]",
};

const NUMBER_CLASSES: Record<SummaryTone, string> = {
  red: "bg-red-500/15 text-red-300",
  amber: "bg-amber-500/15 text-amber-300",
  green: "bg-emerald-500/15 text-emerald-300",
  blue: "bg-sky-500/15 text-sky-300",
};

export function BiExecutiveSummary({
  overview,
  classificationLabels,
  sectorLabels,
}: {
  overview: AnalyticsOverview;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
}) {
  const items: Array<{ text: string; tone: SummaryTone }> = [
    {
      text: comparisonSentence(
        "Tempo de parada",
        overview.comparison.downtimeMinutes,
        formatMinutes,
      ),
      tone:
        overview.comparison.downtimeMinutes.direction === "down" ? "green" : "red",
    },
    {
      text: comparisonSentence("Novos chamados", overview.comparison.callsOpened),
      tone: "amber",
    },
  ];

  if (overview.highlights.topMachine) {
    const machine = overview.highlights.topMachine;
    items.push({
      text: `${machine.machineName} concentra ${machine.sharePercent}% do downtime acumulado do período (${formatMinutes(machine.downtimeMinutes)}).`,
      tone: "red",
    });
  }

  if (overview.highlights.topClassification) {
    const classification = overview.highlights.topClassification;
    const lowSample =
      overview.coverage.finishedCallsWithClassification > 0 &&
      overview.coverage.finishedCallsWithClassification < 5;
    items.push({
      text: `${classificationLabels.get(classification.classification) ?? classification.classification} é a classificação mais recorrente entre os chamados concluídos: ${classification.count} registro(s), ${classification.sharePercent}% do total classificado.${lowSample ? ` Atenção: amostra baixa (${overview.coverage.finishedCallsWithClassification} chamado(s) classificado(s)).` : ""}`,
      tone: lowSample ? "amber" : "blue",
    });
  } else if (overview.highlights.topSector) {
    const sector = overview.highlights.topSector;
    items.push({
      text: `${sectorLabels.get(sector.subtype) ?? sector.subtype} lidera a demanda do período com ${sector.count} chamado(s), ${sector.sharePercent}% das aberturas.`,
      tone: "blue",
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">Resumo executivo</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Leitura determinística do período atual contra o período anterior equivalente
          </p>
        </div>
        <span className="mt-1 text-[10px] font-semibold text-muted-foreground md:mt-0">
          Sem IA · mesmas fórmulas do dashboard
        </span>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.slice(0, 4).map((item, index) => (
          <div
            key={item.text}
            className={`flex gap-2 rounded-lg border p-3 ${TONE_CLASSES[item.tone]}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${NUMBER_CLASSES[item.tone]}`}
            >
              {index + 1}
            </span>
            <p className="text-[13px] leading-5 text-foreground">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
