import type { MachineStopEvent } from "@/types/machine";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { formatDurationMinutes } from "@/utils/durationUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { Check, History, Pencil, X } from "lucide-react";
import { useState } from "react";
import { useAndon } from "@/context/AndonProvider";

interface StopHistoryListProps {
  machineId: string;
  stopHistory: MachineStopEvent[];
}

export function StopHistoryList({ machineId, stopHistory }: StopHistoryListProps) {
  const { updateMachineStopEventDescription } = useAndon();
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
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
            <tr key={s.id} className="text-sm md:text-base">
              <td className="px-3 py-2 font-mono">{formatDateTime(s.stoppedAt)}</td>
              <td className="px-3 py-2 font-mono">
                {s.resumedAt ? formatDateTime(s.resumedAt) : <span className="text-danger">Em curso</span>}
              </td>
              <td className="px-3 py-2 font-bold">
                {s.resumedAt ? formatDurationMinutes(s.durationMinutes) : "—"}
              </td>
              <td className="px-3 py-2">
                {editingEventId === s.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={draftDescription}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                      placeholder="Descreva a falha"
                    />
                    <button
                      onClick={() => {
                        updateMachineStopEventDescription(machineId, s.id, draftDescription);
                        setEditingEventId(null);
                        setDraftDescription("");
                      }}
                      className="rounded-md p-1 text-success hover:bg-success/10"
                      aria-label="Salvar descrição"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingEventId(null);
                        setDraftDescription("");
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Cancelar edição"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-foreground">{s.failureDescription || "Sem descrição"}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.source === "manual_simulation" ? "Simulação manual" : "Node-RED"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingEventId(s.id);
                        setDraftDescription(s.failureDescription ?? "");
                      }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Editar descrição da falha"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
