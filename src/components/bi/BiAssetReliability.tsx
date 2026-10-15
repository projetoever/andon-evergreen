import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
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
  if (value < 60) return `${Math.round(value)} ${ui("min")}`;

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);

  return minutes ? `${hours}${ui("h")} ${minutes}${ui("m")}` : `${hours}${ui("h")}`;
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
  useInterfaceLanguage();
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
  useInterfaceLanguage();
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
        {ui("Confiabilidade por ativo indisponível: ")}
        {systemMessage(error)}
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
              {ui("Ativos prioritários · Bad Actors")}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui(
              "Prioridade objetiva por downtime físico unido. Sem score oculto ou ponderação subjetiva.",
            )}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {ui("Clique em uma máquina para abrir as ocorrências que sustentam o indicador")}
        </span>
      </div>

      <div className="mt-4 grid gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.45fr)]">
        <div className="overflow-x-auto rounded-lg border border-border bg-background/25">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{ui("Ativo", {}, "asset")}</th>
                <th className="px-3 py-3">{ui("Downtime")}</th>
                <th className="px-3 py-3">{ui("Episódios")}</th>
                <th className="px-3 py-3">{ui("Intervalo est.")}</th>
                <th className="px-3 py-3">{ui("Diag. repetido")}</th>
                <th className="px-3 py-3">{ui("Retornos")}</th>
                <th className="px-3 py-3">{ui("Chamado ativo")}</th>
                <th className="px-3 py-3">{ui("Diagnóstico dominante")}</th>
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
                              {ui("inativa")}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-black tabular-nums text-red-300">
                      {formatMinutes(asset.downtimeMinutes)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{asset.physicalStopEpisodes}</td>
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
                            {asset.activeCallCount}
                            {ui(" ativo(s)")}
                          </span>
                          <div className="mt-1 text-[9px] text-muted-foreground">
                            {ui("mais antigo: ")}
                            {formatMinutes(asset.oldestActiveCallMinutes)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      {asset.topDiagnosis
                        ? (classificationLabels.get(asset.topDiagnosis.classification) ??
                          asset.topDiagnosis.classification)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!assets.length && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {ui("Sem ativos com atividade no período")}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background/25 p-4">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wide">
              {ui("Saúde do dado operacional")}
            </h3>
          </div>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            {ui(
              "Alertas para registros ainda abertos que podem inflar tempos e esconder encerramentos esquecidos.",
            )}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <HealthMetric
              label={ui("Chamados ativos > 24h")}
              value={String(health.activeCallsOver24h ?? 0)}
              detail={ui("mais antigo: {0}", { 0: formatMinutes(health.oldestActiveCallMinutes) })}
              attention={(health.activeCallsOver24h ?? 0) > 0}
            />
            <HealthMetric
              label={ui("Eventos físicos > 24h")}
              value={String(health.openFailureEventsOver24h)}
              detail={ui("{0} evento(s) aberto(s) · mais antigo: {1}", {
                0: health.openFailureEvents,
                1: formatMinutes(health.oldestOpenFailureMinutes),
              })}
              attention={health.openFailureEventsOver24h > 0}
            />
            <HealthMetric
              label={ui("Sessões técnicas > 24h")}
              value={String(health.activeSessionsOver24h ?? 0)}
              detail={ui("mais antiga: {0}", {
                0: formatMinutes(health.oldestActiveSessionMinutes),
              })}
              attention={(health.activeSessionsOver24h ?? 0) > 0}
            />
            <HealthMetric
              label={ui("Concluídos sem classificação")}
              value={String(health.finishedCallsMissingClassification)}
              detail={ui("{0} chamado(s) concluído(s) no período", { 0: health.finishedCalls })}
              attention={health.finishedCallsMissingClassification > 0}
            />
          </div>

          {health.standaloneFailureEvents > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 text-[10px] leading-4 text-amber-100">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              {health.standaloneFailureEvents}
              {ui(
                " FailureEvent(s) do período não possuem chamado vinculado. Eles continuam válidos para downtime físico, mas exigem cuidado em análises por setor ou diagnóstico.",
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2 text-[9px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TimerReset className="h-3 w-3" />
              {ui(" downtime")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {ui(" atividade")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {ui(" aging")}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
