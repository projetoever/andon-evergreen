import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import type { AnalyticsMetricComparison, AnalyticsOverview } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} ${ui("min")}`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}${ui("h")} ${minutes}${ui("min")}` : `${hours}${ui("h")}`;
}

function comparisonSentence(
  label: string,
  metric: AnalyticsMetricComparison,
  formatter: (value: number | null) => string = (value) => String(value ?? "—"),
) {
  if (metric.direction === "unavailable") {
    return ui("{0}: comparação indisponível por falta de amostra equivalente.", { 0: label });
  }
  if (metric.direction === "new") {
    return ui("{0}: o período anterior estava em zero; o atual registra {1}.", {
      0: label,
      1: formatter(metric.current),
    });
  }
  if (metric.direction === "flat") {
    return ui("{0}: estável em {1} frente ao período anterior.", {
      0: label,
      1: formatter(metric.current),
    });
  }

  const verb = metric.direction === "up" ? ui("subiu") : ui("caiu");
  return ui("{0}: {1} {2}% frente ao período anterior ({3} → {4}).", {
    0: label,
    1: verb,
    2: Math.abs(metric.deltaPercent ?? 0).toLocaleString(getInterfaceLocale(), {
      maximumFractionDigits: 2,
    }),
    3: formatter(metric.previous),
    4: formatter(metric.current),
  });
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
  useInterfaceLanguage();
  const items: Array<{ text: string; tone: SummaryTone }> = [
    {
      text: comparisonSentence(
        ui("Tempo de parada"),
        overview.comparison.downtimeMinutes,
        formatMinutes,
      ),
      tone: overview.comparison.downtimeMinutes.direction === "down" ? "green" : "red",
    },
    {
      text: comparisonSentence(ui("Novos chamados"), overview.comparison.callsOpened),
      tone: "amber",
    },
  ];

  if (overview.highlights.topMachine) {
    const machine = overview.highlights.topMachine;
    items.push({
      text: ui("A máquina {0} concentrou {1}% do tempo de parada do período ({2}).", {
        0: machine.machineName,
        1: machine.sharePercent.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 }),
        2: formatMinutes(machine.downtimeMinutes),
      }),
      tone: "red",
    });
  }

  if (overview.highlights.topClassification) {
    const classification = overview.highlights.topClassification;
    const lowSample =
      overview.coverage.finishedCallsWithClassification > 0 &&
      overview.coverage.finishedCallsWithClassification < 5;
    items.push({
      text: ui(
        "{0} foi o diagnóstico mais registrado entre os chamados finalizados: {1} ocorrência(s), {2}% dos classificados.{3}",
        {
          0:
            classificationLabels.get(classification.classification) ??
            classification.classification,
          1: classification.count,
          2: classification.sharePercent.toLocaleString(getInterfaceLocale(), {
            maximumFractionDigits: 2,
          }),
          3: lowSample
            ? ui(" Atenção: amostra baixa ({0} chamado(s) classificado(s)).", {
                0: overview.coverage.finishedCallsWithClassification,
              })
            : "",
        },
      ),
      tone: lowSample ? "amber" : "blue",
    });
  } else if (overview.highlights.topSector) {
    const sector = overview.highlights.topSector;
    items.push({
      text: ui("{0} concentrou {1} chamado(s), correspondentes a {2}% das aberturas do período.", {
        0: sectorLabels.get(sector.subtype) ?? sector.subtype,
        1: sector.count,
        2: sector.sharePercent.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 }),
      }),
      tone: "blue",
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">{ui("Resumo executivo")}</h2>
          <p className="sr-only">
            {ui("Leitura determinística do período atual contra o período anterior equivalente")}
          </p>
        </div>
        <span className="sr-only">{ui("Resumo automático · mesmas fórmulas dos indicadores")}</span>
      </div>

      {overview.responsibility && (
        <div
          className="mt-1 text-[11px] leading-4 text-muted-foreground"
          aria-label={ui("Responsabilidade e qualidade dos indicadores")}
        >
          <p>
            <strong>{ui("Parada por causa:")}</strong>{" "}
            {overview.responsibility.downtime
              .filter((item) => item.downtimeMinutes > 0)
              .map(
                (item) =>
                  `${({ maintenance: ui("Manutenção"), operations: ui("Operação"), process: ui("Processos"), quality: ui("Qualidade"), leadership: ui("Liderança"), other: ui("Outros"), unassigned: ui("Pendente") } as Record<string, string>)[item.responsibility] ?? item.responsibility}: ${formatMinutes(item.downtimeMinutes)}`,
              )
              .join(" · ") || ui("Sem paradas")}
            .
          </p>
          <p
            title={ui(
              "Testes, falsos chamados, duplicados e cancelados identificados ficam fora das contagens de chamados. A parada global mantém perdas reais de todas as áreas.",
            )}
          >
            {ui("Excluídos: ")}
            {overview.responsibility.excludedCalls}
            {ui(" chamado(s) · Responsabilidade pendente: ")}
            {overview.responsibility.pendingFinishedCalls}
            {ui(" finalizado(s).")}
          </p>
        </div>
      )}

      <div className="mt-2 grid gap-2 lg:grid-cols-4">
        {items.slice(0, 4).map((item, index) => (
          <div
            key={item.text}
            className={`flex gap-2 rounded-lg border p-2 ${TONE_CLASSES[item.tone]}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${NUMBER_CLASSES[item.tone]}`}
            >
              {index + 1}
            </span>
            <p title={item.text} className="line-clamp-3 text-xs leading-4 text-foreground">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
