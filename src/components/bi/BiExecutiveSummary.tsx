import type { AnalyticsOverview } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function comparisonSentence(
  label: string,
  metric: AnalyticsOverview["comparison"]["downtimeMinutes"],
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

export function BiExecutiveSummary({
  overview,
  classificationLabels,
  sectorLabels,
}: {
  overview: AnalyticsOverview;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
}) {
  const items: string[] = [
    comparisonSentence("Downtime físico", overview.comparison.downtimeMinutes, formatMinutes),
    comparisonSentence("Volume de chamados", overview.comparison.callsOpened),
  ];

  if (overview.highlights.topMachine) {
    const machine = overview.highlights.topMachine;
    items.push(
      `${machine.machineName} concentra ${machine.sharePercent}% do downtime físico do período (${formatMinutes(machine.downtimeMinutes)}).`,
    );
  }

  if (overview.highlights.topClassification) {
    const classification = overview.highlights.topClassification;
    items.push(
      `${classificationLabels.get(classification.classification) ?? classification.classification} é a classificação mais recorrente entre os chamados concluídos: ${classification.count} registro(s), ${classification.sharePercent}% do total classificado.`,
    );
  } else if (overview.highlights.topSector) {
    const sector = overview.highlights.topSector;
    items.push(
      `${sectorLabels.get(sector.subtype) ?? sector.subtype} lidera a demanda do período com ${sector.count} chamado(s), ${sector.sharePercent}% das aberturas.`,
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">Resumo executivo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Leitura determinística do período atual contra o período anterior equivalente
          </p>
        </div>
        <span className="mt-2 text-xs font-semibold text-muted-foreground md:mt-0">
          Sem IA · mesmas fórmulas do dashboard
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.slice(0, 4).map((item, index) => (
          <div
            key={item}
            className="flex gap-3 rounded-lg border border-border bg-background/40 p-4"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black">
              {index + 1}
            </span>
            <p className="text-sm leading-5 text-foreground">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
