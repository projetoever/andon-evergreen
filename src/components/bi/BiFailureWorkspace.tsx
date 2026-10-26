import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useState } from "react";
import { BiFailureIntelligencePanel } from "@/components/bi/BiFailureIntelligencePanel";
import { BiTemporalPatterns } from "@/components/bi/BiTemporalPatterns";
import type {
  AnalyticsDrilldownSelection,
  AnalyticsFailureIntelligence,
  AnalyticsOverview,
  AnalyticsTemporalPatterns,
} from "@/types/analytics";

export function BiFailureWorkspace({
  overview,
  intelligence,
  intelligenceLoading,
  intelligenceError,
  temporal,
  temporalLoading,
  temporalError,
  onTemporalSelected,
  classificationLabels,
  sectorLabels,
  onDrilldown,
}: {
  overview: AnalyticsOverview | null;
  intelligence: AnalyticsFailureIntelligence | null;
  intelligenceLoading: boolean;
  intelligenceError: string | null;
  temporal: AnalyticsTemporalPatterns | null;
  temporalLoading: boolean;
  temporalError: string | null;
  onTemporalSelected: () => void;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onDrilldown: (selection: AnalyticsDrilldownSelection) => void;
}) {
  useInterfaceLanguage();
  const [mode, setMode] = useState<"recurrence" | "distribution" | "temporal">("recurrence");
  const classificationData = (overview?.classificationPareto ?? []).slice(0, 8).map((item) => ({
    ...item,
    value: item.label,
    label: classificationLabels.get(item.label) ?? item.label,
  }));

  const sectorData = (overview?.sectorDistribution ?? []).slice(0, 8).map((item) => ({
    ...item,
    value: item.label,
    label: sectorLabels.get(item.label) ?? item.label,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide">
          {ui("Inteligência de falhas")}
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("recurrence")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              mode === "recurrence"
                ? "bg-red-500/15 text-red-300"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {ui("Reincidências")}
          </button>
          <button
            type="button"
            onClick={() => setMode("distribution")}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              mode === "distribution"
                ? "bg-amber-500/15 text-amber-300"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {ui("Classificações e setores")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("temporal");
              onTemporalSelected();
            }}
            aria-pressed={mode === "temporal"}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${
              mode === "temporal"
                ? "bg-sky-500/15 text-sky-300"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {ui("Padrões temporais")}
          </button>
        </div>
      </div>

      {mode === "recurrence" ? (
        <div className="min-h-0 flex-1">
          <BiFailureIntelligencePanel
            data={intelligence}
            loading={intelligenceLoading}
            error={systemMessage(intelligenceError)}
            classificationLabels={classificationLabels}
          />
        </div>
      ) : mode === "temporal" ? (
        <div className="min-h-0 flex-1">
          <BiTemporalPatterns
            data={temporal}
            loading={temporalLoading}
            error={systemMessage(temporalError)}
          />
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
          <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="shrink-0">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {ui("Pareto de classificações")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui("Diagnóstico registrado na conclusão dos chamados")}
              </p>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-3">
              {classificationData.length ? (
                classificationData.map((item, index) => {
                  const max = classificationData[0]?.count || 1;

                  return (
                    <button
                      type="button"
                      key={item.value}
                      onClick={() =>
                        onDrilldown({
                          dimension: "classification",
                          value: item.value,
                          label: item.label,
                        })
                      }
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-amber-500/30 hover:bg-amber-500/[0.04]"
                    >
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-xs">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-black text-amber-300">
                            {index + 1}
                          </span>
                          <span className="truncate font-bold">{item.label}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{
                              width: `${Math.max(4, (item.count / max) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="self-end text-sm font-black tabular-nums">{item.count}</span>
                    </button>
                  );
                })
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {ui("Sem classificações concluídas no período")}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="shrink-0">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {ui("Demanda por setor")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui("Chamados abertos no período selecionado")}
              </p>
            </div>

            <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-2 content-start gap-3">
              {sectorData.length ? (
                sectorData.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    onClick={() =>
                      onDrilldown({
                        dimension: "sector",
                        value: item.value,
                        label: item.label,
                      })
                    }
                    className="flex items-center justify-between rounded-lg border border-border border-l-2 border-l-sky-400 bg-background/40 px-4 py-3 text-left transition hover:bg-muted"
                  >
                    <span className="truncate text-sm font-semibold">{item.label}</span>
                    <span className="ml-3 text-lg font-black tabular-nums">{item.count}</span>
                  </button>
                ))
              ) : (
                <div className="sm:col-span-2 flex h-full items-center justify-center text-sm text-muted-foreground">
                  {ui("Sem chamados no período")}
                </div>
              )}
            </div>

            <div className="mt-3 shrink-0 rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3">
              <p className="text-[10px] leading-4 text-muted-foreground">
                {ui(
                  "Classificações representam diagnósticos de chamados concluídos; demanda por setor considera aberturas. Para repetição de diagnóstico, use a aba Reincidências.",
                )}
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
