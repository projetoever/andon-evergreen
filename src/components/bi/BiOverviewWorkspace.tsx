import { getInterfaceLocale, ui } from "@/i18n/translate";
import { Activity, BarChart3, Clock3, RotateCcw, TimerReset, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { BiDowntimeTrendCard } from "@/components/bi/BiDowntimeTrendCard";
import { BiChartExplorer } from "@/components/bi/BiChartExplorer";
import { useLanguage } from "@/i18n/LanguageProvider";
import { BiDailyAvailabilityCard } from "@/components/bi/BiDailyAvailabilityCard";
import { BiExecutiveSummary } from "@/components/bi/BiExecutiveSummary";
import { BiKpiCard } from "@/components/bi/BiKpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { explainMissingMtbf, explainMissingMttr, explainPartialMtbf } from "@/utils/biKpiAvailability";
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
  // Do not show zero, N/A or misleading KPI samples before the FIRST
  // server response. Never fabricate metric data while loading.
  if (loading && !overview) {
    return (
      <section role="status" aria-label={t("Carregando indicadores do BI")}
        className="grid min-w-0 gap-3 lg:h-full lg:min-h-0 lg:grid-rows-[auto_auto_minmax(12rem,1fr)]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="h-8 w-1/2 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <Skeleton className="h-20 rounded-xl motion-reduce:animate-none" aria-hidden="true" />
        <div className="grid gap-3 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
              <Skeleton className="h-40 w-full motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  const kpis = overview?.kpis;
  const scheduled = overview?.production;
  const displayPercent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : `${value.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 })}%`;

  const help = {
    availability: {
      measure: ui("Percentual do tempo programado em que as máquinas com histórico completo ficaram sem parada física."),
      formula: ui("100 × (minutos programados − minutos de parada coincidentes, sem sobreposição por máquina) ÷ minutos programados."),
      interpretation: ui("Quanto maior, melhor. Depende da cobertura de produção verificável e não representa OEE."),
      whenUnavailable: ui("Sem programação verificável ou com filtro por setor ou classificação, o valor pode ficar indisponível."),
    },
    mtbf: {
      measure: ui("Tempo programado de operação por início elegível de falha física atribuída exclusivamente à Manutenção."),
      formula: ui("Minutos programados sem paradas físicas ÷ inícios elegíveis de episódios de Manutenção durante a programação."),
      interpretation: ui("Quanto maior, melhor, com atenção ao número de falhas. Se há causas pendentes, o número exibido é provisório e pode mudar após diagnóstico."),
      whenUnavailable: ui("Sem início de falha corretiva confirmada não há amostra; havendo uma ou mais, causas pendentes geram estimativa parcial sinalizada."),
    },
    mtta: {
      measure: ui("Espera média da abertura do chamado ao primeiro atendimento nos chamados atendidos no período."),
      formula: ui("Soma dos minutos da abertura ao primeiro atendimento ÷ quantidade de chamados com primeiro atendimento no período."),
      interpretation: ui("Quanto menor, mais rápida a resposta. Não mede reparo físico nem horas individuais dos técnicos."),
      whenUnavailable: ui("Sem primeiro atendimento válido na janela, não existe amostra para a média."),
    },
    mttr: {
      measure: ui("Tempo médio de restabelecimento físico de paradas encerradas atribuídas integralmente à Manutenção."),
      formula: ui("Soma das durações integrais das paradas elegíveis encerradas na janela ÷ quantidade desses episódios."),
      interpretation: ui("Quanto menor, melhor. Não soma trabalho de técnicos; uma parada pode ter começado antes do período."),
      whenUnavailable: ui("Sem episódios encerrados elegíveis de Manutenção, não há amostra; paradas abertas não contam como zero."),
    },
    downtime: {
      measure: ui("Parada física total no período, de qualquer responsabilidade, inclusive fora da Produção Programada."),
      formula: ui("União dos intervalos físicos por máquina, recortada ao período; os totais de máquinas diferentes são somados."),
      interpretation: ui("Quanto menor, menos tempo parado. Não confundir com paradas restritas à Produção Programada para Disponibilidade."),
      whenUnavailable: ui("Sem paradas registradas, zero pode ser legítimo. Erro de consulta não deve ser apresentado como zero."),
    },
    returnRate: {
      measure: ui("Percentual dos chamados concluídos de Manutenção com motivo corretivo elegível que tiveram retorno ao atendimento."),
      formula: ui("100 × chamados concluídos de Manutenção com motivo corretivo elegível e retorno ÷ total de chamados concluídos de Manutenção com motivo corretivo elegível."),
      interpretation: ui("Quanto menor, menos retornos no mesmo chamado. Não equivale à reincidência registrada em um novo chamado."),
      whenUnavailable: ui("Sem chamados concluídos elegíveis de Manutenção, a taxa não possui amostra."),
    },
  } as const;

  return (
    <div className="grid min-w-0 gap-3 lg:h-full lg:min-h-0 lg:grid-rows-[auto_auto_minmax(12rem,1fr)] lg:overflow-y-auto">
      {overview?.biMeasurementStartAt && <p role="note" className="text-xs text-muted-foreground">
        {ui("Indicadores a partir de {0}. Histórico anterior preservado para auditoria.", {
          0: new Date(overview.biMeasurementStartAt).toLocaleString(getInterfaceLocale()),
        })}
      </p>}
      <section className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <BiKpiCard
          label={t("Disponibilidade")}
          help={help.availability}
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
          help={help.mtbf}
          tooltip={ui(
            "Tempo programado em operação, descontando todas as paradas reais, dividido pelos inícios confirmados de episódios de manutenção. Com causas pendentes, o resultado é provisório e sinalizado.",
          )}
          value={!overview ? "—" : scheduled?.plannedMtbfMinutes == null ? ui("Sem amostra") : formatMinutes(scheduled.plannedMtbfMinutes)}
          detail={
            scheduled?.mtbfSampleStatus === "partial"
              ? explainPartialMtbf(scheduled)
              : scheduled && scheduled.plannedMtbfMinutes === null
                ? explainMissingMtbf(scheduled)
              : ui("{0} falha(s) de manutenção · {1} pendente(s)/misto(s)", {
                  0: scheduled?.productionFailureEpisodes ?? 0,
                  1: scheduled?.pendingAttributionEpisodes ?? 0,
                })
          }
          icon={BarChart3}
          tone={scheduled?.mtbfSampleStatus === "partial" ? "amber" : "green"}
          sampleSize={scheduled?.productionFailureEpisodes}
        />
        <BiKpiCard
          label={t("MTTA")}
          help={help.mtta}
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
          help={help.mttr}
          tooltip={ui(
            "MTTR de restabelecimento: duração integral média de paradas encerradas na janela e inteiramente atribuídas à manutenção. Outras áreas e causas pendentes ficam fora da amostra. Horas técnicas são contabilizadas separadamente.",
          )}
          value={!overview ? "—" : scheduled?.resolvedMttrMinutes == null ? ui("Sem amostra") : formatMinutes(scheduled.resolvedMttrMinutes)}
          detail={
            scheduled && scheduled.resolvedMttrMinutes === null
              ? (scheduled.allCauseRestorationMinutes != null
                ? `${explainMissingMttr(scheduled)} · ${ui("Restauração física observada (não é MTTR):")} ${formatMinutes(scheduled.allCauseRestorationMinutes)}`
                : explainMissingMttr(scheduled))
              : ui("Manutenção · {0} episódio(s) encerrado(s)", {
                  0: scheduled?.resolvedEpisodes ?? 0,
                })
          }
          icon={Wrench}
          tone="blue"
          sampleSize={scheduled?.resolvedEpisodes}
        />
        <BiKpiCard
          label={t("Tempo de parada")}
          help={help.downtime}
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
          help={help.returnRate}
          tooltip={ui(
            "Chamados finalizados atribuídos à manutenção que tiveram retorno, divididos apenas pelos chamados finalizados atribuídos à manutenção. Não é reincidência de novo chamado.",
          )}
          value={!overview ? "—" : kpis?.maintenanceReturnRatePercent == null ? ui("Sem amostra") : displayPercent(kpis.maintenanceReturnRatePercent)}
          detail={ui("{0} de {1} de manutenção · {2} ciclo(s)", {
            0: kpis?.returnedCalls ?? 0,
            1: kpis?.maintenanceEligibleFinishedCalls ?? 0,
            2: kpis?.maintenanceReturnCycles ?? 0,
          }) + ((kpis?.pendingCorrectiveFinishedCalls ?? 0) > 0
            ? ` · ${ui("{0} corretivo(s) aguardam confirmação de responsabilidade", { 0: kpis!.pendingCorrectiveFinishedCalls! })}`
            : "")}
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
              <BiChartExplorer
                title={t("Máquinas com maior parada")}
                description={ui("Parada acumulada por máquina · clique para detalhar")}
                unit="minutes"
                color="#ef4444"
                orientation="horizontal"
                defaultMode="pareto"
                caution={ui("Ranking das máquinas por duração de parada física observada na seleção. Não confundir quantidade de chamados com minutos parados.")}
                rows={overview.machinePareto.map((machine) => ({
                  id: machine.machineId,
                  label: machine.machineName,
                  value: machine.downtimeMinutes,
                  details: [{ label: ui("Ocorrências"), value: String(machine.occurrences) }],
                }))}
                className="h-full"
                allowRank
                onInspectRow={(row) => {
                  const machine = overview.machinePareto.find((item) => item.machineId === row.id);
                  if (machine) onDrilldown({
                    dimension: "machine",
                    value: machine.machineId,
                    label: machine.machineName,
                  });
                }}
              >
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
                    cursor="zoom-in"
                  />
                </BarChart>
              </ResponsiveContainer>
              </BiChartExplorer>
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
