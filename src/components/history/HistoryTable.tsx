import type { AndonCall } from "@/types/andon";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  calculatePostMaintenanceMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
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

export function HistoryTable({
  calls,
}: HistoryTableProps) {
  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-12 w-12" />}
        title="Sem chamados no histórico"
        description="Quando você finalizar um chamado, ele aparecerá aqui."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-3">
              Máquina
            </th>

            <th className="px-3 py-3">
              Localização
            </th>

            <th className="px-3 py-3">
              Motivo da correção
            </th>

            <th className="px-3 py-3">
              Categoria
            </th>

            <th className="px-3 py-3">
              Subtipo
            </th>

            <th className="px-3 py-3">
              Criticidade
            </th>

            <th className="px-3 py-3">
              Conclusão da manutenção
            </th>

            <th className="px-3 py-3">
              Finalizado em
            </th>

            <th className="px-3 py-3">
              Tempo de ANDON
            </th>

            <th className="px-3 py-3">
              Tempo de atendimento
            </th>

            <th className="px-3 py-3">
              Acompanhamento
            </th>

            <th className="px-3 py-3">
              Total
            </th>

            <th className="px-3 py-3">
              Em falha
            </th>

            <th className="px-3 py-3">
              Técnico(s)
            </th>

            <th className="px-3 py-3">
              Retornos
            </th>

            <th className="px-3 py-3">
              Condição
            </th>

            <th className="px-3 py-3">
              Descrição
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-border">
          {calls.map((call) => {
            const technicianNames =
              call.technicianNames.length > 0
                ? call.technicianNames.join(", ")
                : call.technicianName;

            const postMaintenanceMinutes =
              call.postMaintenanceMinutes ||
              calculatePostMaintenanceMinutes(
                call,
              );

            const effectiveAssetLocation =
              getEffectiveAssetLocationLabel(
                call,
                "Não informado",
              );

            return (
              <tr key={call.id}>
                <td className="px-3 py-3 text-lg font-bold">
                  {call.machineId}
                </td>

                <td className="min-w-[190px] px-3 py-3 font-bold text-primary">
                  {effectiveAssetLocation}
                </td>

                <td className="min-w-[190px] whitespace-pre-line px-3 py-3 text-muted-foreground">
                  {call.assetLocationChanged
                    ? call.assetChangeReason ?? "—"
                    : "—"}
                </td>

                <td className="px-3 py-3">
                  {call.category === "maintenance"
                    ? "Manutenção"
                    : "Produção"}
                </td>

                <td className="px-3 py-3 font-bold">
                  {getCallSubtypeLabel(
                    call.subtype,
                  )}
                </td>

                <td className="px-3 py-3">
                  Criticidade:{" "}
                  {getCriticalityLabel(
                    call.criticality,
                  )}
                </td>

                <td className="px-3 py-3 font-mono text-xs">
                  {formatDateTime(
                    call.maintenanceCompletedAt,
                  )}
                </td>

                <td className="px-3 py-3 font-mono text-xs">
                  {formatDateTime(call.finishedAt)}
                </td>

                <td className="px-3 py-3 text-warning">
                  {formatDurationMinutes(
                    call.callWaitingMinutes,
                  )}
                </td>

                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(
                    call.attendanceMinutes,
                  )}
                </td>

                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(
                    postMaintenanceMinutes,
                  )}
                </td>

                <td className="px-3 py-3 font-bold">
                  {formatDurationMinutes(
                    call.totalCallMinutes,
                  )}
                </td>

                <td className="px-3 py-3 text-danger">
                  {formatDurationMinutes(
                    call.machineStoppedMinutes,
                  )}
                </td>

                <td className="px-3 py-3">
                  {technicianNames ?? "—"}
                </td>

                <td className="px-3 py-3">
                  {call.maintenanceReturnCount > 0
                    ? `Retornos à manutenção: ${call.maintenanceReturnCount}`
                    : "—"}
                </td>

                <td className="px-3 py-3">
                  {getMachineConditionLabel(
                    call.machineCondition,
                  )}
                </td>

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
