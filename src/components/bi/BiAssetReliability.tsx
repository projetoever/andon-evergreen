import {
  Activity,
  AlertTriangle,
  Clock3,
  DatabaseZap,
  History,
  RotateCcw,
  ShieldAlert,
  TimerReset,
} from "lucide-react";

import type { AnalyticsAssetReliability } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);

  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function HealthMetric({
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
          ? "rounded-lg border border-red-500/30 bg-red-500/[0.06] p-3"
          : "rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3"
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
      <div className="mt-2 text-xl font-black tabular-nums">{value}</div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>
    </div>
  );
}

export function BiAssetReliability({
  data,
  loading,
  error,
  classificationLabels,
  onSelectMachine,
}: {
  data: AnalyticsAssetReliability | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
  onSelectMachine: (machineId: string, machineName: string) => void;
}) {
  if (loading && !data) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="h-56 animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-5 text-sm text-amber-200">
        Confiabilidade por ativo indisponível: {error}
      </section>
    );
  }

  if (!data) return null;

  const assets = data.assets
    .filter(
      (asset) =>
        asset.isActive ||
        asset.downtimeMinutes > 0 ||
        asset.callsOpened > 0 ||
        (asset.activeCallCount ?? 0) > 0,
    )
    .slice(0, 8);
  const health = data.dataHealth;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              Ativos prioritários · Bad Actors
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Prioridade objetiva por downtime físico unido. Sem score oculto ou ponderação subjetiva.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Clique em uma máquina para abrir as ocorrências que sustentam o indicador
        </span>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.45fr)]">
        <div className="overflow-x-auto rounded-lg border border-border bg-background/25">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Ativo</th>
                <th className="px-3 py-3">Downtime</th>
                <th className="px-3 py-3">Episódios</th>
                <th className="px-3 py-3" title="Estimativa por calendário, não por horas programadas de produção">MTBF est.</th>
                <th className="px-3 py-3">Diag. repetido</th>
                <th className="px-3 py-3">Retornos</th>
                <th className="px-3 py-3">Chamado ativo</th>
                <th className="px-3 py-3">Diagnóstico dominante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assets.map((asset, index) => {
                const stale = (asset.oldestActiveCallMinutes ?? 0) >= 24 * 60;
                return (
                  <tr
                    key={asset.machineId}
                    className="cursor-pointer transition hover:bg-muted/40"
                    onClick={() => onSelectMachine(asset.machineId, asset.machineName)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            index < 3
                              ? "flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-black text-red-300"
                              : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-black text-muted-foreground"
                          }
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-black">{asset.machineName}</div>
                          {!asset.isActive && (
                            <span className="text-[9px] uppercase text-muted-foreground">
                              inativa
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-black tabular-nums text-red-300">
                      {formatMinutes(asset.downtimeMinutes)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {asset.physicalStopEpisodes}
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums text-emerald-300">
                      {formatMinutes(asset.mtbfEstimatedMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={
                          asset.repeatDiagnosisCount > 0
                            ? "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-black text-amber-300"
                            : "text-muted-foreground"
                        }
                      >
                        {asset.repeatDiagnosisCount}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1">
                        <RotateCcw className="h-3 w-3 text-muted-foreground" />
                        {asset.maintenanceReturnCycles}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {(asset.activeCallCount ?? 0) > 0 ? (
                        <div>
                          <span
                            className={
                              stale
                                ? "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 font-black text-red-300"
                                : "rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-black text-sky-300"
                            }
                          >
                            {asset.activeCallCount} ativo(s)
                          </span>
                          <div className="mt-1 text-[9px] text-muted-foreground">
                            mais antigo: {formatMinutes(asset.oldestActiveCallMinutes)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      {asset.topDiagnosis
                        ? classificationLabels.get(asset.topDiagnosis.classification) ??
                          asset.topDiagnosis.classification
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!assets.length && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sem ativos com atividade no período
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background/25 p-4">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wide">
              Saúde do dado operacional
            </h3>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            Alertas para registros ainda abertos que podem inflar tempos e esconder encerramentos esquecidos.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <HealthMetric
              label="Chamados ativos > 24h"
              value={String(health.activeCallsOver24h ?? 0)}
              detail={`mais antigo: ${formatMinutes(health.oldestActiveCallMinutes)}`}
              attention={(health.activeCallsOver24h ?? 0) > 0}
            />
            <HealthMetric
              label="Eventos físicos > 24h"
              value={String(health.openFailureEventsOver24h)}
              detail={`${health.openFailureEvents} evento(s) aberto(s) · mais antigo: ${formatMinutes(health.oldestOpenFailureMinutes)}`}
              attention={health.openFailureEventsOver24h > 0}
            />
            <HealthMetric
              label="Sessões técnicas > 24h"
              value={String(health.activeSessionsOver24h ?? 0)}
              detail={`mais antiga: ${formatMinutes(health.oldestActiveSessionMinutes)}`}
              attention={(health.activeSessionsOver24h ?? 0) > 0}
            />
            <HealthMetric
              label="Concluídos sem classificação"
              value={String(health.finishedCallsMissingClassification)}
              detail={`${health.finishedCalls} chamado(s) concluído(s) no período`}
              attention={health.finishedCallsMissingClassification > 0}
            />
          </div>

          {health.standaloneFailureEvents > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[10px] leading-4 text-amber-100">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              {health.standaloneFailureEvents} FailureEvent(s) do período não possuem chamado vinculado.
              Eles continuam válidos para downtime físico, mas exigem cuidado em análises por setor ou diagnóstico.
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-[9px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TimerReset className="h-3 w-3" /> downtime
            </span>
            <span className="inline-flex items-center gap-1">
              <Activity className="h-3 w-3" /> atividade
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" /> aging
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
