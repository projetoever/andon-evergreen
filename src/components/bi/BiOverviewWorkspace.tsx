import {
  Activity,
  BarChart3,
  Clock3,
  RotateCcw,
  TimerReset,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { BiDowntimeTrendCard } from "@/components/bi/BiDowntimeTrendCard";
import { BiExecutiveSummary } from "@/components/bi/BiExecutiveSummary";
import { BiKpiCard } from "@/components/bi/BiKpiCard";
import type {
  AnalyticsDrilldownSelection,
  AnalyticsOverview,
  AndonBiPeriodPreset,
} from "@/types/analytics";

const PERIOD_LABELS: Record<AndonBiPeriodPreset, string> = {
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function BiOverviewWorkspace({
  overview,
  loading,
  period,
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

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-3">
      <section className="grid shrink-0 grid-cols-6 gap-3">
        <BiKpiCard
          label="Novos chamados"
          value={loading && !overview ? "…" : String(kpis?.callsOpened ?? 0)}
          detail={`${kpis?.callsFinished ?? 0} finalizado(s) na janela · aberturas do período`}
          icon={Activity}
          tone="amber"
          trend={overview?.comparison.callsOpened}
          trendMeaning="neutral"
        />
        <BiKpiCard
          label="Chamados ativos"
          value={
            loading && !overview
              ? "…"
              : kpis?.activeCallsNow === null
                ? "—"
                : String(kpis?.activeCallsNow ?? 0)
          }
          detail={
            kpis?.activeCallsNow === null
              ? "Indisponível com classificação"
              : "Snapshot atual do ANDON"
          }
          icon={BarChart3}
          tone="blue"
        />
        <BiKpiCard
          label="MTTA"
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttaMinutes ?? null)}
          detail={`Abertura → 1º atendimento · ${overview?.coverage.mttaSampleSize ?? 0} amostra(s)`}
          icon={Clock3}
          tone="amber"
          trend={overview?.comparison.mttaMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttaSampleSize}
        />
        <BiKpiCard
          label="Manutenção média"
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttrMinutes ?? null)}
          detail={`Tempo nos concluídos · ${overview?.coverage.mttrSampleSize ?? 0} amostra(s)`}
          icon={Wrench}
          tone="blue"
          trend={overview?.comparison.mttrMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttrSampleSize}
        />
        <BiKpiCard
          label="Tempo de parada"
          value={loading && !overview ? "…" : formatMinutes(kpis?.downtimeMinutes ?? 0)}
          detail={`${kpis?.physicalStopEpisodes ?? 0} episódio(s) físico(s) · várias máquinas somadas`}
          icon={TimerReset}
          tone="red"
          trend={overview?.comparison.downtimeMinutes}
          trendMeaning="lowerBetter"
        />
        <BiKpiCard
          label="Taxa de retorno"
          value={
            loading && !overview
              ? "…"
              : kpis?.maintenanceReturnRatePercent === null
                ? "—"
                : `${kpis?.maintenanceReturnRatePercent ?? 0}%`
          }
          detail={`${kpis?.returnedCalls ?? 0} chamado(s) com retorno · ${kpis?.maintenanceReturnCycles ?? 0} ciclo(s)`}
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
        <article className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wide">
                Chamados por dia
              </h2>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Novos × finalizados em cada data
              </p>
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {PERIOD_LABELS[period]}
            </span>
          </div>

          {overview?.trend.length ? (
            <div className="mt-2 min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.trend}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateLabel}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={(value) => formatDateLabel(String(value))}
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 10,
                    }}
                  />
                  <Line
                    name="Abertos"
                    type="monotone"
                    dataKey="callsOpened"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    name="Concluídos"
                    type="monotone"
                    dataKey="callsFinished"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
              Sem chamados no período
            </div>
          )}
        </article>

        <BiDowntimeTrendCard data={overview?.downtimeTrend ?? []} />

        <article className="flex min-h-0 flex-col rounded-xl border border-red-500/20 bg-card p-4 shadow-sm">
          <div className="shrink-0">
            <h2 className="text-xs font-black uppercase tracking-wide">Pareto de máquinas</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Downtime acumulado · clique para detalhar
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
