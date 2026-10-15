import {
  CheckCircle2,
  Gauge,
  Layers3,
  ShieldAlert,
  Timer,
  TimerReset,
} from "lucide-react";

import type { AnalyticsOverview } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function MiniMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Gauge;
  accent: "red" | "amber" | "green" | "blue";
}) {
  const accentClass = {
    red: "border-l-red-500 text-red-400",
    amber: "border-l-amber-400 text-amber-400",
    green: "border-l-emerald-400 text-emerald-400",
    blue: "border-l-sky-400 text-sky-400",
  }[accent];

  return (
    <article className={`rounded-lg border border-border border-l-2 bg-card px-3 py-2 ${accentClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1 text-lg font-black tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</div>
    </article>
  );
}

export function BiReliabilityStrip({ overview }: { overview: AnalyticsOverview }) {
  const { kpis, coverage } = overview;
  const mtbfAvailable = kpis.mtbfEstimatedMinutes !== null;

  return (
    <section className="rounded-xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
            Indicadores de confiabilidade
          </h2>
          <p className="hidden">
            Indicadores complementares para leitura de manutenção e confiabilidade
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Intervalo = estimativa por calendário (todas as máquinas da população); não é tempo produtivo real
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2">
        <MiniMetric
          label="Intervalo entre paradas (calendário)"
          value={formatMinutes(kpis.mtbfEstimatedMinutes)}
          detail={
            mtbfAvailable
              ? `${kpis.mtbfEstimatedMachineCount ?? 0} máquina(s) na população`
              : "Indisponível com filtro de setor/classificação ou sem episódios"
          }
          icon={Gauge}
          accent="green"
        />
        <MiniMetric
          label="Episódios físicos"
          value={String(kpis.physicalStopEpisodes)}
          detail={`${kpis.failureOccurrences} evento(s) físicos iniciados na janela; episódios podem ter começado antes`}
          icon={ShieldAlert}
          accent="red"
        />
        <MiniMetric
          label="Parada média / episódio"
          value={formatMinutes(kpis.avgDowntimePerEpisodeMinutes)}
          detail="Tempo físico médio por episódio, inclusive paradas abertas"
          icon={TimerReset}
          accent="red"
        />
        <MiniMetric
          label="Duração média do chamado"
          value={formatMinutes(kpis.avgTotalCallMinutes)}
          detail="Da abertura ao encerramento dos chamados finalizados"
          icon={Timer}
          accent="blue"
        />
        <MiniMetric
          label="Chamados finalizados"
          value={String(kpis.callsFinished)}
          detail={`${kpis.callsOpened} abertura(s) na janela`}
          icon={CheckCircle2}
          accent="green"
        />
        <MiniMetric
          label="Diagnósticos preenchidos"
          value={
            kpis.classificationCoveragePercent === null
              ? "—"
              : `${kpis.classificationCoveragePercent}%`
          }
          detail={`${coverage.finishedCallsWithClassification}/${coverage.finishedCalls} concluído(s) classificados`}
          icon={Layers3}
          accent={kpis.classificationCoveragePercent !== null && kpis.classificationCoveragePercent >= 80 ? "green" : "amber"}
        />
      </div>
    </section>
  );
}
