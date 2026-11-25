import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import type { AndonCall } from "@/types/andon";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { calculatePostMaintenanceMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import {
  getCallSubtypeLabel,
  getCriticalityLabel,
  getMachineConditionLabel,
} from "@/utils/statusUtils";
import { getEffectiveAssetLocationLabel } from "@/utils/assetLocationUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

interface HistoryTableProps {
  calls: AndonCall[];
}

export function HistoryTable({ calls }: HistoryTableProps) {
  useInterfaceLanguage();
  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-12 w-12" />}
        title={ui("Sem chamados no histórico")}
        description={ui("Quando você finalizar um chamado, ele aparecerá aqui.")}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      {/* On phones, preserve all historical fields without a 17-column sideways table. */}
      <div className="space-y-3 lg:hidden" aria-label={ui("Histórico de chamados")}>
        {calls.map((call) => {
          const technicianNames =
            call.technicianNames.length > 0
              ? call.technicianNames.join(", ")
              : call.technicianName;
          const postMaintenanceMinutes =
            call.postMaintenanceMinutes || calculatePostMaintenanceMinutes(call);
          const mobileFields = [
            { label: "Localização", value: getEffectiveAssetLocationLabel(call, ui("Não informado")) },
            { label: "Motivo da correção", value: call.assetLocationChanged ? (call.assetChangeReason ?? "—") : "—" },
            { label: "Categoria", value: call.callReasonSnapshot?.reasonNameSnapshot ?? (call.category === "maintenance" ? ui("Manutenção") : ui("Produção")) },
            { label: "Subtipo", value: call.callReasonSnapshot?.optionNameSnapshot ?? getCallSubtypeLabel(call.subtype) },
            { label: "Criticidade", value: getCriticalityLabel(call.criticality) },
            { label: "Conclusão da manutenção", value: formatDateTime(call.maintenanceCompletedAt) },
            { label: "Finalizado em", value: formatDateTime(call.finishedAt) },
            { label: "Tempo de ANDON", value: formatDurationMinutes(call.callWaitingMinutes) },
            { label: "Tempo de atendimento", value: formatDurationMinutes(call.attendanceMinutes) },
            { label: "Acompanhamento", value: formatDurationMinutes(postMaintenanceMinutes) },
            { label: "Total", value: formatDurationMinutes(call.totalCallMinutes) },
            { label: "Em falha", value: formatDurationMinutes(call.machineStoppedMinutes) },
            { label: "Técnico(s)", value: technicianNames },
            { label: "Retornos", value: call.maintenanceReturnCount > 0
              ? ui("Retornos à manutenção: {0}", { 0: call.maintenanceReturnCount }) : "—" },
            { label: "Condição", value: getMachineConditionLabel(call.machineCondition) },
            { label: "Descrição", value: call.notes ?? "—" },
          ];
          return (
            <details key={call.id} className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card">
              <summary className="cursor-pointer list-none space-y-3 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all text-base font-black text-foreground">{call.machineId}</p>
                    <p className="mt-1 break-words text-xs font-semibold text-muted-foreground">
                      {call.callReasonSnapshot?.optionNameSnapshot ?? getCallSubtypeLabel(call.subtype)}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {formatDateTime(call.finishedAt)}
                  </span>
                </div>
                {call.isSystemTest && (
                  <span className="inline-flex rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-bold text-warning">
                    {ui("Teste automático")}
                  </span>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  <div className="min-w-0 rounded-lg bg-muted/40 p-2">
                    <span className="block text-muted-foreground">{ui("Tempo de atendimento")}</span>
                    <strong className="mt-1 block break-words font-mono text-foreground">
                      {formatDurationMinutes(call.attendanceMinutes)}
                    </strong>
                  </div>
                  <div className="min-w-0 rounded-lg bg-muted/40 p-2">
                    <span className="block text-muted-foreground">{ui("Em falha")}</span>
                    <strong className="mt-1 block break-words font-mono text-danger">
                      {formatDurationMinutes(call.machineStoppedMinutes)}
                    </strong>
                  </div>
                </div>
                <p className="text-xs font-semibold text-primary">
                  <span className="group-open:hidden">{ui("Detalhes")}</span>
                  <span className="hidden group-open:inline">{ui("Ocultar detalhes")}</span>
                </p>
              </summary>
              <dl className="grid min-w-0 grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2">
                {mobileFields.map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ui(label)}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                      {value ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border lg:block">
        <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-3">{ui("Máquina")}</th>

            <th className="px-3 py-3">{ui("Localização")}</th>

            <th className="px-3 py-3">{ui("Motivo da correção")}</th>

            <th className="px-3 py-3">{ui("Categoria")}</th>

            <th className="px-3 py-3">{ui("Subtipo")}</th>

            <th className="px-3 py-3">{ui("Criticidade")}</th>

            <th className="px-3 py-3">{ui("Conclusão da manutenção")}</th>

            <th className="px-3 py-3">{ui("Finalizado em")}</th>

            <th className="px-3 py-3">{ui("Tempo de ANDON")}</th>

            <th className="px-3 py-3">{ui("Tempo de atendimento")}</th>

            <th className="px-3 py-3">{ui("Acompanhamento")}</th>

            <th className="px-3 py-3">{ui("Total")}</th>

            <th className="px-3 py-3">{ui("Em falha")}</th>

            <th className="px-3 py-3">{ui("Técnico(s)")}</th>

            <th className="px-3 py-3">{ui("Retornos")}</th>

            <th className="px-3 py-3">{ui("Condição")}</th>

            <th className="px-3 py-3">{ui("Descrição")}</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {calls.map((call) => {
            const technicianNames =
              call.technicianNames.length > 0
                ? call.technicianNames.join(", ")
                : call.technicianName;

            const postMaintenanceMinutes =
              call.postMaintenanceMinutes || calculatePostMaintenanceMinutes(call);

            const effectiveAssetLocation = getEffectiveAssetLocationLabel(
              call,
              ui("Não informado"),
            );

            return (
              <tr key={call.id}>
                <td className="px-3 py-3">
                  <div className="text-lg font-bold">{call.machineId}</div>
                  {call.isSystemTest && (
                    <span className="mt-1 inline-flex rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-warning">
                      {ui("Teste automático")}
                    </span>
                  )}
                </td>

                <td className="min-w-[190px] px-3 py-3 font-bold text-primary">
                  {effectiveAssetLocation}
                </td>

                <td className="min-w-[190px] whitespace-pre-line px-3 py-3 text-muted-foreground">
                  {call.assetLocationChanged ? (call.assetChangeReason ?? "—") : "—"}
                </td>

                <td className="px-3 py-3">
                  {call.callReasonSnapshot?.reasonNameSnapshot ?? (call.category === "maintenance" ? ui("Manutenção") : ui("Produção"))}
                </td>

                <td className="px-3 py-3 font-bold">{call.callReasonSnapshot?.optionNameSnapshot ?? getCallSubtypeLabel(call.subtype)}</td>

                <td className="px-3 py-3">
                  {ui("Criticidade:")} {getCriticalityLabel(call.criticality)}
                </td>

                <td className="px-3 py-3 font-mono text-xs">
                  {formatDateTime(call.maintenanceCompletedAt)}
                </td>

                <td className="px-3 py-3 font-mono text-xs">{formatDateTime(call.finishedAt)}</td>

                <td className="px-3 py-3 text-warning">
                  {formatDurationMinutes(call.callWaitingMinutes)}
                </td>

                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(call.attendanceMinutes)}
                </td>

                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(postMaintenanceMinutes)}
                </td>

                <td className="px-3 py-3 font-bold">
                  {formatDurationMinutes(call.totalCallMinutes)}
                </td>

                <td className="px-3 py-3 text-danger">
                  {formatDurationMinutes(call.machineStoppedMinutes)}
                </td>

                <td className="px-3 py-3">{technicianNames ?? "—"}</td>

                <td className="px-3 py-3">
                  {call.maintenanceReturnCount > 0
                    ? ui("Retornos à manutenção: {0}", { 0: call.maintenanceReturnCount })
                    : "—"}
                </td>

                <td className="px-3 py-3">{getMachineConditionLabel(call.machineCondition)}</td>

                <td className="whitespace-pre-line px-3 py-3 text-muted-foreground">
                  {call.notes ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}
