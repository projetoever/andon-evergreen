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
    <div className="overflow-x-auto rounded-xl border border-border">
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
                  {call.category === "maintenance" ? ui("Manutenção") : ui("Produção")}
                </td>

                <td className="px-3 py-3 font-bold">{getCallSubtypeLabel(call.subtype)}</td>

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
  );
}
