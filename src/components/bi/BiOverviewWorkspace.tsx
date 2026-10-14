import { Activity, BarChart3, Clock3, RotateCcw, TimerReset, Wrench } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BiDowntimeTrendCard } from "@/components/bi/BiDowntimeTrendCard";
import { BiDailyAvailabilityCard } from "@/components/bi/BiDailyAvailabilityCard";
import { BiExecutiveSummary } from "@/components/bi/BiExecutiveSummary";
import { BiKpiCard } from "@/components/bi/BiKpiCard";
import type {
  AnalyticsDrilldownSelection,
  AnalyticsOverview,
  AndonBiPeriodPreset,
} from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function BiOverviewWorkspace({
  overview,
  loading,
  classificationLabels,
  sectorLabels,
  onDrilldown,
}: {
  overview: AnalyticsOverview | null;
  loading: boolean;
  period: AndonBiPeriodPreset;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onDrilldown: (selection: AnalyticsDrilldownSelection) => void;
}) {
  const kpis = overview?.kpis;
  const scheduled = overview?.production;
  const displayPercent = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" :
    `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      <section className="grid shrink-0 grid-cols-6 gap-3">
        <BiKpiCard
          label="Disponibilidade"
          tooltip="Disponibilidade nas horas registradas como Produção Programada, somente nas máquinas com histórico completo. Não é OEE nem calendário de turnos."
          value={loading && !overview ? "…" : displayPercent(scheduled?.availabilityPercent)}
          detail={scheduled?.availabilityStatus === "dimension_filtered"
            ? "Indisponível com filtro por setor ou classificação"
            : `${scheduled?.coveredMachineCount ?? 0}/${scheduled?.populationCount ?? 0} máquinas com programação verificável`}
          icon={Activity}
          tone="green"
        />
        <BiKpiCard
          label="MTBF"
          tooltip="Tempo em produção programada sem parada / episódios de parada durante produção programada. Somente máquinas com histórico completo."
          value={loading && !overview ? "…" : formatMinutes(scheduled?.plannedMtbfMinutes ?? null)}
          detail={scheduled?.availabilityStatus === "dimension_filtered"
            ? "Indisponível com filtro por setor ou classificação"
            : `${scheduled?.productionFailureEpisodes ?? 0} episódio(s) em produção · MTBF estimado por programação`}
          icon={BarChart3}
          tone="green"
        />
        <BiKpiCard
          label="MTTA"
          tooltip="Tempo médio da abertura ao primeiro atendimento dos chamados atendidos no período."
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttaMinutes ?? null)}
          detail={`Até o primeiro atendimento · ${overview?.coverage.mttaSampleSize ?? 0} amostra(s)`}
          icon={Clock3}
          tone="amber"
          trend={overview?.comparison.mttaMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttaSampleSize}
        />
        <BiKpiCard
          label="MTTR"
          tooltip="Tempo médio para restabelecimento físico: duração integral de episódios de parada encerrados na janela. Não confundir com tempo efetivo de manutenção."
          value={loading && !overview ? "…" : formatMinutes(scheduled?.resolvedMttrMinutes ?? null)}
          detail={`Paradas encerradas · ${scheduled?.resolvedEpisodes ?? 0} episódio(s)`}
          icon={Wrench}
          tone="blue"
          sampleSize={scheduled?.resolvedEpisodes}
        />
        <BiKpiCard
          label="Tempo de parada"
          tooltip="Parada física total, inclusive fora da Produção Programada, em união temporal por máquina. Difere da parada descontada da disponibilidade."
          value={loading && !overview ? "…" : formatMinutes(kpis?.downtimeMinutes ?? null)}
          detail={`${kpis?.physicalStopEpisodes ?? 0} episódio(s) registrados · todas as horas`}
          icon={TimerReset}
          tone="red"
          trend={overview?.comparison.downtimeMinutes}
          trendMeaning="lowerBetter"
        />
        <BiKpiCard
          label="Taxa de retorno"
          tooltip="Chamados finalizados que voltaram à manutenção ao menos uma vez, divididos pelos chamados finalizados no período."
          value={loading && !overview ? "…" : displayPercent(kpis?.maintenanceReturnRatePercent)}
          detail={`${kpis?.returnedCalls ?? 0} de ${kpis?.callsFinished ?? 0} finalizados · ${kpis?.maintenanceReturnCycles ?? 0} ciclo(s)`}
          icon={RotateCcw}
          tone="red"
          sampleSize={overview?.coverage.finishedCalls}
        />
      </section>

      {overview ? (
        <BiExecutiveSummary
          overview={overview}
          classificationLabels={classificationLabels}
          sectorLabels={sectorLabels}
        />
      ) : (
        <div className="h-32 animate-pulse rounded-xl border border-border bg-muted/20" />
      )}

      <section className="grid min-h-0 grid-cols-3 gap-3">
        <BiDailyAvailabilityCard data={scheduled} />

        <BiDowntimeTrendCard data={overview?.downtimeTrend ?? []} />

        <article className="flex min-h-0 flex-col rounded-xl border border-red-500/20 bg-card p-4 shadow-sm">
          <div className="shrink-0">
            <h2 className="text-xs font-black uppercase tracking-wide">Máquinas com maior parada</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Parada acumulada por máquina · clique para detalhar
            </p>
          </div>

          {overview?.machinePareto.length ? (
            <div className="mt-2 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overview.machinePareto.slice(0, 6)}
                  layout="vertical"
                  margin={{ left: 4, right: 6 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="machineName"
                    width={76}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [formatMinutes(Number(value)), "Tempo de parada"]}
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 10,
                    }}
                  />
                  <Bar
                    dataKey="downtimeMinutes"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(entry: unknown) => {
                      const item = entry as {
                        machineId?: unknown;
                        machineName?: unknown;
                      };
                      if (
                        typeof item.machineId === "string" &&
                        typeof item.machineName === "string"
                      ) {
                        onDrilldown({
                          dimension: "machine",
                          value: item.machineId,
                          label: item.machineName,
                        });
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
              Sem paradas registradas no período
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
