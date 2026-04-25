import type { MachineStopEvent } from "@/types/machine";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { formatDurationMinutes } from "@/utils/durationUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

interface StopHistoryListProps {
  stopHistory: MachineStopEvent[];
}

export function StopHistoryList({ stopHistory }: StopHistoryListProps) {
  if (stopHistory.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="Sem paradas registradas"
        description="Quando a máquina parar, o evento será listado aqui."
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-left">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Início</th>
            <th className="px-4 py-3">Retorno</th>
            <th className="px-4 py-3">Duração</th>
            <th className="px-4 py-3">Origem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stopHistory.map((s) => (
            <tr key={s.id} className="text-sm">
              <td className="px-4 py-3 font-mono">{formatDateTime(s.stoppedAt)}</td>
              <td className="px-4 py-3 font-mono">
                {s.resumedAt ? formatDateTime(s.resumedAt) : <span className="text-danger">Em curso</span>}
              </td>
              <td className="px-4 py-3 font-bold">
                {s.resumedAt ? formatDurationMinutes(s.durationMinutes) : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {s.source === "manual_simulation" ? "Simulação manual" : "Node-RED"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
