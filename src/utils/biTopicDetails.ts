import { getInterfaceLocale, ui } from "@/i18n/translate";
import type { AnalyticsDrilldownSelection, AnalyticsOverview } from "@/types/analytics";

export type BiDetailTopic =
  | "availability"
  | "mtbf"
  | "mtta"
  | "mttr"
  | "downtime"
  | "return-rate"
  | "calendar-interval"
  | "physical-episodes"
  | "avg-downtime"
  | "avg-call"
  | "finished-calls"
  | "classification-coverage"
  | "availability-daily"
  | "downtime-daily"
  | "machines"
  | "classifications"
  | "sectors";

export type BiTopicRow = {
  id: string;
  cells: string[];
  selection?: AnalyticsDrilldownSelection;
};
export type BiTopicDetail = {
  title: string;
  value: string;
  definition: string;
  formula: string;
  inputs: Array<{ label: string; value: string }>;
  columns: string[];
  rows: BiTopicRow[];
  notice?: string;
  chart?: { unit: string; points: Array<{ id: string; label: string; value: number | null }> };
};

const number = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 });
const minutes = (value: number | null | undefined) =>
  value == null ? "—" : `${number(value)} ${ui("min")}`;
const percent = (value: number | null | undefined) => (value == null ? "—" : `${number(value)}%`);

/** Display only: all KPI values and populations remain authoritative API results. */
export function buildBiTopicDetail(
  topic: BiDetailTopic,
  overview: AnalyticsOverview,
  classificationLabels: ReadonlyMap<string, string>,
  sectorLabels: ReadonlyMap<string, string>,
): BiTopicDetail {
  const { kpis: k, coverage: c, production: p } = overview;
  const input = (label: string, value: string) => ({ label, value });
  const productionInputs = [
    input(ui("Tempo programado"), minutes(p?.scheduledMinutes)),
    input(ui("Parada durante a programação"), minutes(p?.scheduledDowntimeMinutes)),
    input(ui("Tempo programado em operação"), minutes(p?.operatingMinutes)),
    input(
      ui("Máquinas com histórico completo"),
      p ? `${p.coveredMachineCount}/${p.populationCount}` : "—",
    ),
  ];
  const availability = topic === "availability" || topic === "availability-daily";
  const downtime = topic === "downtime" || topic === "downtime-daily";
  if (availability || downtime) {
    const rows: BiTopicRow[] = availability
      ? (p?.daily ?? []).map((d) => ({
          id: d.date,
          cells: [
            d.date,
            minutes(d.scheduledMinutes),
            minutes(d.scheduledDowntimeMinutes),
            percent(d.availabilityPercent),
          ],
        }))
      : overview.downtimeTrend.map((d) => ({
          id: d.date,
          cells: [d.date, minutes(d.downtimeMinutes)],
        }));
    return {
      title: availability ? ui("Disponibilidade por dia") : ui("Tempo de parada por dia"),
      value: availability ? percent(p?.availabilityPercent) : minutes(k.downtimeMinutes),
      definition: availability
        ? ui(
            "Disponibilidade nas horas registradas como Produção Programada, somente nas máquinas com histórico completo. Não é OEE nem calendário de turnos.",
          )
        : ui(
            "Parada física total, inclusive fora da Produção Programada, em união temporal por máquina. Difere da parada descontada da disponibilidade.",
          ),
      formula: availability
        ? ui("Tempo programado em operação ÷ tempo programado × 100")
        : ui("União das paradas de cada máquina, recortada ao período; soma entre máquinas"),
      inputs: availability
        ? productionInputs
        : [
            input(ui("Episódios físicos"), number(k.physicalStopEpisodes)),
            input(ui("Eventos físicos iniciados na janela"), number(k.failureOccurrences)),
          ],
      columns: availability
        ? [ui("Data"), ui("Tempo programado"), ui("Tempo de parada"), ui("Disponibilidade")]
        : [ui("Data"), ui("Tempo de parada")],
      rows,
      notice:
        availability && p?.availabilityStatus !== "available"
          ? p?.availabilityStatus === "dimension_filtered"
            ? ui("Indisponível com filtro de setor ou classificação.")
            : ui("Não há tempo programado com histórico completo na seleção.")
          : undefined,
      chart: {
        unit: availability ? "%" : ui("min"),
        points: availability
          ? (p?.daily ?? []).map((d) => ({
              id: d.date,
              label: d.date,
              value: d.availabilityPercent,
            }))
          : overview.downtimeTrend.map((d) => ({
              id: d.date,
              label: d.date,
              value: d.downtimeMinutes,
            })),
      },
    };
  }
  if (topic === "machines" || topic === "classifications" || topic === "sectors") {
    const machines = topic === "machines";
    const classifications = topic === "classifications";
    const entries = machines
      ? overview.machinePareto.map((r) => ({
          id: r.machineId,
          label: r.machineName,
          value: r.downtimeMinutes,
          count: r.occurrences,
        }))
      : (classifications ? overview.classificationPareto : overview.sectorDistribution).map(
          (r) => ({
            id: r.label,
            label: (classifications ? classificationLabels : sectorLabels).get(r.label) ?? r.label,
            value: r.count,
            count: r.count,
          }),
        );
    const dimension = machines ? "machine" : classifications ? "classification" : "sector";
    return {
      title: machines
        ? ui("Máquinas com maior parada")
        : classifications
          ? ui("Pareto de classificações")
          : ui("Demanda por setor"),
      value: ui("{0} grupo(s) na consulta", { 0: entries.length }),
      definition: machines
        ? ui("Ranking retornado pela consulta; selecione uma linha para investigar os registros.")
        : ui(
            "Classificações representam diagnósticos de chamados concluídos; demanda por setor considera aberturas. Para repetição de diagnóstico, use a aba Reincidências.",
          ),
      formula: machines
        ? ui("União das paradas de cada máquina, recortada ao período; soma entre máquinas")
        : classifications
          ? ui("Chamados distintos concluídos por diagnóstico final")
          : ui("Chamados distintos abertos por setor solicitado"),
      inputs: [],
      columns: [
        machines ? ui("Máquina") : classifications ? ui("Classificação") : ui("Setor"),
        machines ? ui("Tempo de parada") : ui("Chamados"),
      ],
      rows: entries.map((r) => ({
        id: r.id,
        cells: [r.label, machines ? minutes(r.value) : number(r.value)],
        selection: { dimension, value: r.id, label: r.label },
      })),
      chart: {
        unit: machines ? ui("min") : ui("Chamados"),
        points: entries.map((r) => ({ id: r.id, label: r.label, value: r.value })),
      },
    };
  }

  const definitions = {
    mtbf: {
      title: ui("MTBF"),
      value: minutes(p?.plannedMtbfMinutes),
      definition: ui(
        "Tempo programado em operação, descontando todas as paradas reais, dividido pelos inícios de episódios de manutenção durante a programação. Causas pendentes ou mistas tornam o MTBF indisponível.",
      ),
      formula: ui(
        "Tempo programado em operação ÷ falhas de manutenção iniciadas durante a programação",
      ),
      inputs: [
        ...productionInputs,
        input(ui("Falhas de manutenção na programação"), number(p?.productionFailureEpisodes)),
        input(ui("Episódios pendentes ou mistos"), number(p?.pendingAttributionEpisodes)),
      ],
    },
    mtta: {
      title: ui("MTTA"),
      value: minutes(k.mttaMinutes),
      definition: ui(
        "Tempo médio da abertura ao primeiro atendimento dos chamados atendidos no período.",
      ),
      formula: ui("Soma da espera até o primeiro atendimento ÷ chamados atendidos elegíveis"),
      inputs: [
        input(ui("Amostra"), number(c.mttaSampleSize)),
        input(
          ui("Período anterior equivalente"),
          minutes(overview.comparison.mttaMinutes.previous),
        ),
      ],
    },
    mttr: {
      title: ui("MTTR"),
      value: minutes(p?.resolvedMttrMinutes),
      definition: ui(
        "MTTR de restabelecimento: duração integral média de paradas encerradas na janela e inteiramente atribuídas à manutenção. Outras áreas e causas pendentes ficam fora da amostra. Horas técnicas são contabilizadas separadamente.",
      ),
      formula: ui(
        "Duração integral das paradas de manutenção encerradas ÷ episódios encerrados elegíveis",
      ),
      inputs: [
        input(ui("Episódios de manutenção encerrados"), number(p?.resolvedEpisodes)),
        input(ui("Atendimento técnico médio por chamado"), minutes(k.avgMaintenanceMinutes)),
      ],
    },
    "return-rate": {
      title: ui("Taxa de retorno"),
      value: percent(k.maintenanceReturnRatePercent),
      definition: ui(
        "Chamados finalizados atribuídos à manutenção que tiveram retorno, divididos apenas pelos chamados finalizados atribuídos à manutenção. Não é reincidência de novo chamado.",
      ),
      formula: ui(
        "Chamados de manutenção concluídos com retorno ÷ chamados de manutenção concluídos × 100",
      ),
      inputs: [
        input(ui("Chamados com retorno"), number(k.returnedCalls)),
        input(ui("Chamados de manutenção concluídos"), number(k.maintenanceEligibleFinishedCalls)),
        input(ui("Ciclos de retorno"), number(k.maintenanceReturnCycles)),
      ],
    },
    "calendar-interval": {
      title: ui("Intervalo entre paradas (calendário)"),
      value: minutes(k.mtbfEstimatedMinutes),
      definition: ui(
        "Intervalo = estimativa por calendário (todas as máquinas da população); não é tempo produtivo real",
      ),
      formula: ui("Exposição calendário em operação ÷ episódios físicos da população"),
      inputs: [
        input(ui("Exposição calendário"), minutes(c.calendarExposureMinutes)),
        input(ui("Exposição em operação"), minutes(c.operatingExposureMinutes)),
        input(ui("Máquinas na população"), number(k.mtbfEstimatedMachineCount)),
      ],
    },
    "physical-episodes": {
      title: ui("Episódios físicos"),
      value: number(k.physicalStopEpisodes),
      definition: ui(
        "Eventos sobrepostos ou contíguos da mesma máquina formam um episódio. Chamados e sessões não multiplicam episódios.",
      ),
      formula: ui("Contagem da união de intervalos físicos por máquina"),
      inputs: [
        input(ui("Eventos físicos iniciados na janela"), number(k.failureOccurrences)),
        input(ui("Tempo de parada"), minutes(k.downtimeMinutes)),
      ],
    },
    "avg-downtime": {
      title: ui("Parada média / episódio"),
      value: minutes(k.avgDowntimePerEpisodeMinutes),
      definition: ui("Tempo físico médio por episódio, inclusive paradas abertas"),
      formula: ui("Parada física recortada ao período ÷ episódios físicos sobrepostos ao período"),
      inputs: [
        input(ui("Tempo de parada"), minutes(k.downtimeMinutes)),
        input(ui("Episódios físicos"), number(k.physicalStopEpisodes)),
      ],
    },
    "avg-call": {
      title: ui("Duração média do chamado"),
      value: minutes(k.avgTotalCallMinutes),
      definition: ui("Da abertura ao encerramento dos chamados finalizados"),
      formula: ui(
        "Soma das durações válidas de chamados concluídos ÷ chamados concluídos com duração válida",
      ),
      inputs: [
        input(ui("Chamados finalizados"), number(k.callsFinished)),
        input(ui("Atendimento técnico médio por chamado"), minutes(k.avgMaintenanceMinutes)),
        input(ui("Acompanhamento médio"), minutes(k.avgPostMaintenanceMinutes)),
      ],
    },
    "finished-calls": {
      title: ui("Chamados finalizados"),
      value: number(k.callsFinished),
      definition: ui(
        "Aberturas e conclusões são populações diferentes. Um chamado concluído pode ter sido aberto antes do período.",
      ),
      formula: ui("IDs distintos com conclusão dentro do período"),
      inputs: [
        input(ui("Chamados abertos"), number(k.callsOpened)),
        input(ui("Chamados finalizados"), number(k.callsFinished)),
      ],
    },
    "classification-coverage": {
      title: ui("Diagnósticos preenchidos"),
      value: percent(k.classificationCoveragePercent),
      definition: ui(
        "Diagnósticos genéricos ou ausentes não comprovam causa. A cobertura usa os chamados concluídos elegíveis.",
      ),
      formula: ui("Chamados concluídos com diagnóstico válido ÷ chamados concluídos × 100"),
      inputs: [
        input(ui("Concluídos com diagnóstico"), number(c.finishedCallsWithClassification)),
        input(ui("Chamados finalizados"), number(c.finishedCalls)),
      ],
    },
  };
  return { ...definitions[topic], columns: [], rows: [] };
}
