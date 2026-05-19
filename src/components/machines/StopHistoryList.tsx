import type { MachineStopEvent } from "@/types/machine";
import { useState } from "react";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { formatDurationMinutes } from "@/utils/durationUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { Check, History, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StopHistoryListProps {
  machineId: string;
  stopHistory: MachineStopEvent[];
  onUpdateFailureDescription: (stopEventId: string, failureDescription: string) => void;
}

export function StopHistoryList({ machineId, stopHistory, onUpdateFailureDescription }: StopHistoryListProps) {
  const [editingStopEventId, setEditingStopEventId] = useState<string | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  if (stopHistory.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="Sem falhas registradas"
        description="Quando a máquina entrar em falha, o evento será listado aqui."
        className="px-6 py-8"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Início</th>
            <th className="px-3 py-2">Retorno</th>
            <th className="px-3 py-2">Duração</th>
            <th className="px-3 py-2">Descrição da Falha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {stopHistory.map((s) => (
            <tr key={s.id} className="text-sm">
              <td className="px-3 py-2 font-mono">{formatDateTime(s.stoppedAt)}</td>
              <td className="px-3 py-2 font-mono">
                {s.resumedAt ? formatDateTime(s.resumedAt) : <span className="text-danger">Em curso</span>}
              </td>
              <td className="px-3 py-2 font-bold">
                {s.resumedAt ? formatDurationMinutes(s.durationMinutes) : "—"}
              </td>
              <td className="px-3 py-2">
                {editingStopEventId === s.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      className="h-8 text-sm"
                    />
                    <Button
                      type="button"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        onUpdateFailureDescription(s.id, draftDescription);
                        setEditingStopEventId(null);
                      }}
                      aria-label={`Salvar descrição da falha da máquina ${machineId}`}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-foreground">{s.failureDescription?.trim() || "Sem descrição"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.source === "manual_simulation" ? "Simulação manual" : "Node-RED"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingStopEventId(s.id);
                        setDraftDescription(s.failureDescription ?? "");
                      }}
                      aria-label={`Editar descrição da falha da máquina ${machineId}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
