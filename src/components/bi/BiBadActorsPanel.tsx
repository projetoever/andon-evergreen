import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { RotateCcw, ShieldAlert } from "lucide-react";

import type { AnalyticsAssetReliability } from "@/types/analytics";

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} ${ui("min")}`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}${ui("h")} ${minutes}${ui("m")}` : `${hours}${ui("h")}`;
}

export function BiBadActorsPanel({
  data,
  loading,
  error,
  classificationLabels,
  onSelectMachine,
  population = "active",
}: {
  data: AnalyticsAssetReliability | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
  onSelectMachine: (machineId: string, machineName: string) => void;
  population?: "active" | "inactive" | "all";
}) {
  useInterfaceLanguage();
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
        {ui("Confiabilidade por ativo indisponível: ")}
        {systemMessage(error)}
      </section>
    );
  }

  if (!data) return null;

  const eligibleAssets = data.assets
    .filter(
      (asset) =>
        population === "all" || (population === "active" ? asset.isActive : !asset.isActive),
    )
    .filter(
      (asset) =>
        asset.downtimeMinutes > 0 ||
        asset.callsOpened > 0 ||
        (asset.activeCallCount ?? 0) > 0 ||
        asset.repeatDiagnosisCount > 0 ||
        asset.maintenanceReturnCycles > 0,
    );
  const assets = eligibleAssets.slice(0, 8);

  return (
    <section className="flex min-w-0 flex-col lg:h-full lg:min-h-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              {ui("Máquinas críticas · Bad Actors")}
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Ranking por tempo de parada físico · ")}
            {population === "active"
              ? ui("máquinas ativas")
              : population === "inactive"
                ? ui("máquinas inativas")
                : ui("todas as máquinas")}
            {ui(" · top 8.")}
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {eligibleAssets.length}
          {ui(" ativo(s) · clique para Machine 360")}
        </span>
      </div>

      <div className="mt-3 min-h-0 min-w-0 flex-1 overflow-auto lg:overflow-hidden rounded-lg border border-border bg-background/25">
        <table className="w-full min-w-[48rem] lg:min-w-0 table-fixed text-left text-xs">
          <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-[22%] px-3 py-2">{ui("Ativo", {}, "asset")}</th>
              <th className="w-[12%] px-2 py-2">{ui("Parada")}</th>
              <th className="w-[9%] px-2 py-2">{ui("Episódios")}</th>
              <th
                className="w-[12%] px-2 py-2"
                title={ui(
                  "Intervalo entre paradas (calendário) indisponível para máquinas inativas",
                )}
              >
                {ui("Intervalo est.")}
              </th>
              <th className="w-[11%] px-2 py-2">{ui("Diag. repet.")}</th>
              <th className="w-[9%] px-2 py-2">{ui("Retornos")}</th>
              <th className="w-[12%] px-2 py-2">{ui("Chamados ativos")}</th>
              <th className="px-2 py-2">{ui("Diagnóstico")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {assets.map((asset, index) => (
              <tr
                key={asset.machineId}
                className="cursor-pointer transition hover:bg-muted/40"
                onClick={() => onSelectMachine(asset.machineId, asset.machineName)}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        index < 3
                          ? "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-black text-red-300"
                          : "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-black text-muted-foreground"
                      }
                    >
                      {index + 1}
                    </span>
                    <span className="truncate font-black">{asset.machineName}</span>
                  </div>
                </td>
                <td className="px-2 py-2 font-black tabular-nums text-red-300">
                  {formatMinutes(asset.downtimeMinutes)}
                </td>
                <td className="px-2 py-2 tabular-nums">{asset.physicalStopEpisodes}</td>
                <td className="px-2 py-2 font-semibold tabular-nums text-emerald-300">
                  {asset.isActive ? formatMinutes(asset.mtbfEstimatedMinutes) : "—"}
                </td>
                <td className="px-2 py-2">
                  {asset.repeatDiagnosisCount > 0 ? (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-black text-amber-300">
                      {asset.repeatDiagnosisCount}
                    </span>
                  ) : (
                    "0"
                  )}
                </td>
                <td className="px-2 py-2">
                  <span className="inline-flex items-center gap-1">
                    <RotateCcw className="h-3 w-3 text-muted-foreground" />
                    {asset.maintenanceReturnCycles}
                  </span>
                </td>
                <td className="px-2 py-2">
                  {(asset.activeCallCount ?? 0) > 0 ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-black text-red-300">
                      {asset.activeCallCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="truncate px-2 py-2">
                  {asset.topDiagnosis
                    ? (classificationLabels.get(asset.topDiagnosis.classification) ??
                      asset.topDiagnosis.classification)
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!assets.length && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {ui("Sem ativos com ocorrências no período")}
          </div>
        )}
      </div>
    </section>
  );
}
