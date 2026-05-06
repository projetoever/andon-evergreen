import type { AndonCall } from "@/types/andon";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { calculatePostMaintenanceMinutes, formatDurationMinutes } from "@/utils/durationUtils";
import { getCallSubtypeLabel, getCriticalityLabel } from "@/utils/statusUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

interface HistoryTableProps {
  calls: AndonCall[];
}

export function HistoryTable({ calls }: HistoryTableProps) {
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
            <th className="px-3 py-3">Máquina</th>
            <th className="px-3 py-3">Categoria</th>
            <th className="px-3 py-3">Subtipo</th>
            <th className="px-3 py-3">Criticidade</th>
            <th className="px-3 py-3">Aberto</th>
            <th className="px-3 py-3">Atendido</th>
            <th className="px-3 py-3">Finalizado</th>
            <th className="px-3 py-3">Tempo de ANDON</th>
            <th className="px-3 py-3">Tempo de atendimento</th>
            <th className="px-3 py-3">Acompanhamento</th>
            <th className="px-3 py-3">Total</th>
            <th className="px-3 py-3">Parada</th>
            <th className="px-3 py-3">Técnico(s)</th>
            <th className="px-3 py-3">Retornos</th>
            <th className="px-3 py-3">Descrição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {calls.map((c) => {
            const technicianNames =
              c.technicianNames.length > 0 ? c.technicianNames.join(", ") : c.technicianName;
            const postMaintenanceMinutes =
              c.postMaintenanceMinutes || calculatePostMaintenanceMinutes(c);
            return (
              <tr key={c.id}>
                <td className="px-3 py-3 text-lg font-bold">{c.machineId}</td>
                <td className="px-3 py-3">
                  {c.category === "maintenance" ? "Manutenção" : "Produção"}
                </td>
                <td className="px-3 py-3 font-bold">{getCallSubtypeLabel(c.subtype)}</td>
                <td className="px-3 py-3">Criticidade: {getCriticalityLabel(c.criticality)}</td>
                <td className="px-3 py-3 font-mono text-xs">{formatDateTime(c.openedAt)}</td>
                <td className="px-3 py-3 font-mono text-xs">{formatDateTime(c.attendedAt)}</td>
                <td className="px-3 py-3 font-mono text-xs">{formatDateTime(c.finishedAt)}</td>
                <td className="px-3 py-3 text-warning">
                  {formatDurationMinutes(c.callWaitingMinutes)}
                </td>
                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(c.attendanceMinutes)}
                </td>
                <td className="px-3 py-3 text-info">
                  {formatDurationMinutes(postMaintenanceMinutes)}
                </td>
                <td className="px-3 py-3 font-bold">{formatDurationMinutes(c.totalCallMinutes)}</td>
                <td className="px-3 py-3 text-danger">
                  {formatDurationMinutes(c.machineStoppedMinutes)}
                </td>
                <td className="px-3 py-3">{technicianNames ?? "—"}</td>
                <td className="px-3 py-3">
                  {c.maintenanceReturnCount > 0
                    ? `Retornos à manutenção: ${c.maintenanceReturnCount}`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{c.notes ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
