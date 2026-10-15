import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import type { MachineStopEvent } from "@/types/machine";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { formatDurationMinutes } from "@/utils/durationUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { History } from "lucide-react";

interface StopHistoryListProps {
  stopHistory: MachineStopEvent[];
}

export function StopHistoryList({ stopHistory }: StopHistoryListProps) {
  useInterfaceLanguage();
  if (stopHistory.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title={ui("Sem falhas registradas")}
        description={ui("Quando a máquina entrar em falha, o evento será listado aqui.")}
        className="px-6 py-8"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{ui("Início")}</th>
            <th className="px-3 py-2">{ui("Retorno")}</th>
            <th className="px-3 py-2">{ui("Duração")}</th>
            <th className="px-3 py-2">{ui("Origem")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stopHistory.map((s) => (
            <tr key={s.id} className="text-sm">
              <td className="px-3 py-2 font-mono">{formatDateTime(s.stoppedAt)}</td>
              <td className="px-3 py-2 font-mono">
                {s.resumedAt ? (
                  formatDateTime(s.resumedAt)
                ) : (
                  <span className="text-danger">{ui("Em curso")}</span>
                )}
              </td>
              <td className="px-3 py-2 font-bold">
                {s.resumedAt ? formatDurationMinutes(s.durationMinutes) : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {s.source === "manual_simulation" ? ui("Simulação manual") : "Node-RED"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
