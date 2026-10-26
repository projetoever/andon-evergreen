import { getInterfaceLocale, ui } from "@/i18n/translate";
import { Activity, BarChart3, Clock3, RotateCcw, TimerReset, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BiDowntimeTrendCard } from "@/components/bi/BiDowntimeTrendCard";
import { useLanguage } from "@/i18n/LanguageProvider";
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
  if (rounded < 60) return `${rounded} ${ui("min")}`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}${ui("h")} ${minutes}${ui("m")}` : `${hours}${ui("h")}`;
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
  const { t } = useLanguage();
  const kpis = overview?.kpis;
  const scheduled = overview?.production;
  const displayPercent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : `${value.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 })}%`;

  return (
    <div className="grid min-w-0 gap-3 lg:h-full lg:min-h-0 lg:grid-rows-[auto_auto_minmax(12rem,1fr)] lg:overflow-y-auto">
      <section className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <BiKpiCard
          label={t("Disponibilidade")}
          tooltip={ui(
            "Disponibilidade nas horas registradas como Produção Programada, somente nas máquinas com histórico completo. Não é OEE nem calendário de turnos.",
          )}
          value={loading && !overview ? "…" : displayPercent(scheduled?.availabilityPercent)}
          detail={
            scheduled?.availabilityStatus === "dimension_filtered"
              ? ui("Indisponível com filtro por setor ou classificação")
              : ui("{0}/{1} máquinas com programação verificável", {
                  0: scheduled?.coveredMachineCount ?? 0,
                  1: scheduled?.populationCount ?? 0,
                })
          }
          icon={Activity}
          tone="green"
        />
        <BiKpiCard
          label={t("MTBF")}
          tooltip={ui(
            "Tempo programado em operação, descontando todas as paradas reais, dividido pelos inícios de episódios de manutenção durante a programação. Causas pendentes ou mistas tornam o MTBF indisponível.",
          )}
          value={loading && !overview ? "…" : formatMinutes(scheduled?.plannedMtbfMinutes ?? null)}
          detail={
            scheduled?.availabilityStatus === "dimension_filtered"
              ? ui("Indisponível com filtro por setor ou classificação")
              : ui("{0} falha(s) de manutenção · {1} pendente(s)/misto(s)", {
                  0: scheduled?.productionFailureEpisodes ?? 0,
                  1: scheduled?.pendingAttributionEpisodes ?? 0,
                })
          }
          icon={BarChart3}
          tone="green"
        />
        <BiKpiCard
          label={t("MTTA")}
          tooltip={ui(
            "Tempo médio da abertura ao primeiro atendimento dos chamados atendidos no período.",
          )}
          value={loading && !overview ? "…" : formatMinutes(kpis?.mttaMinutes ?? null)}
          detail={ui("Até o primeiro atendimento · {0} amostra(s)", {
            0: overview?.coverage.mttaSampleSize ?? 0,
          })}
          icon={Clock3}
          tone="amber"
          trend={overview?.comparison.mttaMinutes}
          trendMeaning="lowerBetter"
          sampleSize={overview?.coverage.mttaSampleSize}
        />
        <BiKpiCard
          label={t("MTTR")}
          tooltip={ui(
            "MTTR de restabelecimento: duração integral média de paradas encerradas na janela e inteiramente atribuídas à manutenção. Outras áreas e causas pendentes ficam fora da amostra. Horas técnicas são contabilizadas separadamente.",
          )}
          value={loading && !overview ? "…" : formatMinutes(scheduled?.resolvedMttrMinutes ?? null)}
          detail={ui("Manutenção · {0} episódio(s) encerrado(s)", {
            0: scheduled?.resolvedEpisodes ?? 0,
          })}
          icon={Wrench}
          tone="blue"
          sampleSize={scheduled?.resolvedEpisodes}
        />
        <BiKpiCard
          label={t("Tempo de parada")}
          tooltip={ui(
            "Parada física total, inclusive fora da Produção Programada, em união temporal por máquina. Difere da parada descontada da disponibilidade.",
          )}
          value={loading && !overview ? "…" : formatMinutes(kpis?.downtimeMinutes ?? null)}
          detail={ui("{0} episódio(s) registrados · todas as horas", {
            0: kpis?.physicalStopEpisodes ?? 0,
          })}
          icon={TimerReset}
          tone="red"
          trend={overview?.comparison.downtimeMinutes}
          trendMeaning="lowerBetter"
        />
        <BiKpiCard
          label={t("Taxa de retorno")}
          tooltip={ui(
            "Chamados finalizados atribuídos à manutenção que tiveram retorno, divididos apenas pelos chamados finalizados atribuídos à manutenção. Não é reincidência de novo chamado.",
          )}
          value={loading && !overview ? "…" : displayPercent(kpis?.maintenanceReturnRatePercent)}
          detail={ui("{0} de {1} de manutenção · {2} ciclo(s)", {
            0: kpis?.returnedCalls ?? 0,
            1: kpis?.maintenanceEligibleFinishedCalls ?? 0,
            2: kpis?.maintenanceReturnCycles ?? 0,
          })}
          icon={RotateCcw}
          tone="red"
          sampleSize={kpis?.maintenanceEligibleFinishedCalls}
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

      <section className="grid min-w-0 gap-3 lg:min-h-0 lg:grid-cols-3">
        <BiDailyAvailabilityCard data={scheduled} />

        <BiDowntimeTrendCard data={overview?.downtimeTrend ?? []} />

        <article className="flex min-w-0 flex-col rounded-xl lg:min-h-0 border border-red-500/20 bg-card p-4 shadow-sm">
          <div className="shrink-0">
            <h2 className="text-xs font-black uppercase tracking-wide">
              {t("Máquinas com maior parada")}
            </h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {ui("Parada acumulada por máquina · clique para detalhar")}
            </p>
          </div>

          {overview?.machinePareto.length ? (
            <div className="mt-2 h-60 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
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
                    formatter={(value) => [formatMinutes(Number(value)), ui("Tempo de parada")]}
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
              {ui("Sem paradas registradas no período")}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
