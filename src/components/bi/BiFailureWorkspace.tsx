import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useState } from "react";
import { BiFailureIntelligencePanel } from "@/components/bi/BiFailureIntelligencePanel";
import { BiTemporalPatterns } from "@/components/bi/BiTemporalPatterns";
import { BiChartExplorer } from "@/components/bi/BiChartExplorer";
import { BiInlineDistributionChart } from "@/components/bi/BiInlineDistributionChart";
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
  const [mode, setMode] = useState<"recurrence" | "distribution" | "temporal">("distribution");
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
    <div className="flex min-w-0 flex-col gap-3">
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
        <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
          <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="shrink-0">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {ui("Pareto de classificações")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui("Diagnóstico registrado na conclusão dos chamados")}
              </p>
              <div className="mt-2"><BiChartExplorer launcher
                title={ui("Pareto de classificações")} description={ui("Diagnóstico registrado na conclusão dos chamados")}
                chartKind="categorical" orientation="horizontal" unit="count" color="#f59e0b"
                rows={classificationData.map(item=>({id:item.value,label:item.label,value:item.count}))}
                caution={ui("Diagnósticos dos chamados concluídos; apenas as categorias exibidas participam da distribuição.")}
                allowRank /></div>
            </div>
            <div className="mt-4 min-w-0 flex-1">
              <BiInlineDistributionChart
                rows={classificationData.map(item=>({id:item.value,label:item.label,value:item.count}))}
                unit="count" color="#f59e0b" height={330}
                onInspect={id=>{const item=classificationData.find(row=>row.value===id);if(item)onDrilldown({dimension:"classification",value:item.value,label:item.label});}} />
            </div>

          </section>

          <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="shrink-0">
              <h2 className="text-sm font-black uppercase tracking-wide">
                {ui("Demanda por setor")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {ui("Chamados abertos no período selecionado")}
              </p>
              <div className="mt-2"><BiChartExplorer launcher
                title={ui("Demanda por setor")} description={ui("Chamados abertos no período selecionado")}
                chartKind="categorical" orientation="horizontal" unit="count" color="#38bdf8"
                rows={sectorData.map(item=>({id:item.value,label:item.label,value:item.count}))}
                caution={ui("Chamados abertos por setor; não representa tempo de parada nem esforço técnico.")}
                allowRank /></div>
            </div>
            <div className="mt-4 min-w-0 flex-1">
              <BiInlineDistributionChart
                rows={sectorData.map(item=>({id:item.value,label:item.label,value:item.count}))}
                unit="count" color="#38bdf8" height={330}
                onInspect={id=>{const item=sectorData.find(row=>row.value===id);if(item)onDrilldown({dimension:"sector",value:item.value,label:item.label});}} />
            </div>



          </section>
        </div>
      )}
    </div>
  );
}
