import { AlertTriangle, DatabaseZap, History } from "lucide-react";

import type { AnalyticsAssetReliability } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function Metric({
  label,
  value,
  detail,
  attention,
}: {
  label: string;
  value: string;
  detail: string;
  attention: boolean;
}) {
  return (
    <div
      className={
        attention
          ? "rounded-lg border border-red-500/30 bg-red-500/[0.06] p-4"
          : "rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {attention ? (
          <AlertTriangle className="h-4 w-4 text-red-400" />
        ) : (
          <DatabaseZap className="h-4 w-4 text-emerald-400" />
        )}
      </div>
      <div className="mt-2 text-2xl font-black tabular-nums">{value}</div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function BiDataHealthPanel({
  data,
  loading,
  error,
}: {
  data: AnalyticsAssetReliability | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !data) {
    return (
      <section className="h-full rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="h-full animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="h-full rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-sm text-amber-200">
        Saúde do dado indisponível: {error}
      </section>
    );
  }

  if (!data) return null;

  const health = data.dataHealth;

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-black uppercase tracking-wide">
            Saúde do dado operacional
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Registros abertos por tempo excessivo podem inflar downtime, MTBF/MTTR e pessoa-minutos.
        </p>
      </div>

      <div className="mt-4 grid shrink-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Chamados ativos > 24h"
          value={String(health.activeCallsOver24h ?? 0)}
          detail={`Mais antigo: ${formatMinutes(health.oldestActiveCallMinutes)}`}
          attention={(health.activeCallsOver24h ?? 0) > 0}
        />
        <Metric
          label="Eventos físicos > 24h"
          value={String(health.openFailureEventsOver24h)}
          detail={`${health.openFailureEvents} aberto(s) · mais antigo: ${formatMinutes(
            health.oldestOpenFailureMinutes,
          )}`}
          attention={health.openFailureEventsOver24h > 0}
        />
        <Metric
          label="Sessões técnicas > 24h"
          value={String(health.activeSessionsOver24h ?? 0)}
          detail={`Mais antiga: ${formatMinutes(health.oldestActiveSessionMinutes)}`}
          attention={(health.activeSessionsOver24h ?? 0) > 0}
        />
        <Metric
          label="Concluídos sem classificação"
          value={String(health.finishedCallsMissingClassification)}
          detail={`${health.finishedCalls} concluído(s) no período`}
          attention={health.finishedCallsMissingClassification > 0}
        />
      </div>

      <div className="mt-4 grid min-h-0 flex-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/25 p-4">
          <h3 className="text-xs font-black uppercase tracking-wide">
            Alertas de integridade
          </h3>
          <div className="mt-3 space-y-3 text-sm">
            <div
              className={
                health.standaloneFailureEvents > 0
                  ? "rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3"
                  : "rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3"
              }
            >
              <div className="flex items-start gap-2">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div>
                  <div className="font-black">
                    FailureEvents sem chamado: {health.standaloneFailureEvents}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Continuam válidos para downtime físico, mas não devem ser atribuídos
                    automaticamente a setor ou diagnóstico de chamado.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="font-black">Regra operacional do BI</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Nenhum alerta corrige ou encerra registros automaticamente. A finalidade é
                indicar dados que precisam de investigação no processo operacional.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/25 p-4">
          <h3 className="text-xs font-black uppercase tracking-wide">
            Impacto potencial nos indicadores
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-red-300">
                Downtime
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                FailureEvent aberto continua contribuindo para a janela selecionada até ser
                encerrado.
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-sky-300">
                Participação técnica
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Sessão técnica aberta continua acumulando pessoa-minutos.
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-300">
                Chamados ativos
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Chamado não finalizado permanece no snapshot atual independentemente do período
                histórico.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-emerald-300">
                Cobertura
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Classificação e vínculo com chamado aumentam a precisão dos Paretos e análises
                futuras de reincidência.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
