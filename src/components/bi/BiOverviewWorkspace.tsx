import {
  Activity,
  Gauge,
  Clock3,
  RotateCcw,
  TimerReset,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BiAvailabilityDailyCard } from "@/components/bi/BiAvailabilityDailyCard";
import { BiDowntimeTrendCard } from "@/components/bi/BiDowntimeTrendCard";
import { BiExecutiveSummary } from "@/components/bi/BiExecutiveSummary";
import { BiKpiCard } from "@/components/bi/BiKpiCard";
import type {
  AnalyticsDrilldownSelection,
  AnalyticsOverview,
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
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onDrilldown: (selection: AnalyticsDrilldownSelection) => void;
}) {
  const kpis = overview?.kpis;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      <section className="grid shrink-0 grid-cols-6 gap-3">
        <BiKpiCard
          label="Disponibilidade operacional"
          tooltip="Percentual do tempo registrado como Produção Programada sem parada física. Só disponível com histórico completo de programação para todas as máquinas consideradas; não é OEE."
          value={loading && !overview ? "…" : kpis && overview?.scheduledPerformance.availabilityPercent !== null
            ? `${overview?.scheduledPerformance.availabilityPercent.toLocaleString("pt-BR",{maximumFractionDigits:2})}%` : "—"}
          detail={overview?.scheduledPerformance.coverageComplete
            ? `${formatMinutes(overview.scheduledPerformance.scheduledMinutes)} programados · ${formatMinutes(overview.scheduledPerformance.scheduledDowntimeMinutes)} parados`
            : overview?.scheduledPerformance.reason ?? "Aguardando dados de programação"}
          icon={Gauge}
          tone="green"
        />
        <BiKpiCard
          label="MTBF programado"
          tooltip="MTBF calculado com tempo registrado como Produção Programada, descontando o tempo de parada dentro desses intervalos, dividido pelos episódios de parada correspondentes. Sem histórico completo, o resultado fica indisponível."
          value={loading && !overview ? "…" : formatMinutes(overview?.scheduledPerformance.mtbfScheduledMinutes ?? null)}
          detail={overview?.scheduledPerformance.coverageComplete
            ? `${overview.scheduledPerformance.scheduledStopEpisodes} episódio(s) em produção programada`
            : overview?.scheduledPerformance.reason ?? "Histórico de programação insuficiente"}
          icon={Activity}
          tone="green"
        />
        <BiKpiCard
          label="MTTA"
          tooltip="Tempo médio entre abertura do chamado e primeiro atendimento iniciado na janela selecionada."
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttaMinutes ?? null)}
          detail={`Da abertura ao 1º atendimento · ${overview?.coverage.mttaSampleSize ?? 0} amostra(s)`}
          icon={Clock3}
          tone="amber"
          trend={overview?.comparison.mttaMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttaSampleSize}
        />
        <BiKpiCard
          label="MTTR operacional"
          tooltip="Tempo médio efetivo de manutenção nos chamados finalizados da janela (attendanceMinutes). Não representa necessariamente o tempo físico total até o restabelecimento da produção."
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttrMinutes ?? null)}
          detail={`Tempo de manutenção registrado · ${overview?.coverage.mttrSampleSize ?? 0} amostra(s)`}
          icon={Wrench}
          tone="blue"
          trend={overview?.comparison.mttrMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttrSampleSize}
        />
        <BiKpiCard
          label="Tempo de parada"
          tooltip="Soma da duração das paradas físicas registradas, com deduplicação de intervalos sobrepostos por máquina. Inclui paradas fora da produção programada; é diferente do tempo de parada usado na disponibilidade."
          value={loading && !overview ? "…" : formatMinutes(kpis?.downtimeMinutes ?? null)}
          detail={`${kpis?.physicalStopEpisodes ?? 0} episódio(s) · todas as paradas registradas`}
          icon={TimerReset}
          tone="red"
          trend={overview?.comparison.downtimeMinutes}
          trendMeaning="lowerBetter"
        />
        <BiKpiCard
          label="Taxa de retorno"
          tooltip="Quantidade de chamados finalizados com pelo menos um retorno à manutenção dividida pelos chamados finalizados no período. Não significa reincidência em novo chamado."
          value={loading && !overview ? "…" : kpis?.maintenanceReturnRatePercent === null
            ? "—" : `${kpis?.maintenanceReturnRatePercent ?? 0}%`}
          detail={`${kpis?.returnedCalls ?? 0} de ${kpis?.callsFinished ?? 0} finalizados retornaram · ${kpis?.maintenanceReturnCycles ?? 0} ciclo(s)`}
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
        <BiAvailabilityDailyCard overview={overview} />

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
                    formatter={(value) => [formatMinutes(Number(value)), "Downtime"]}
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
              Sem downtime no período
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
