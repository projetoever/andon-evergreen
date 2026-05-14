import { useAndon } from "@/context/AndonProvider";
import { BigButton } from "@/components/common/BigButton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function SimulationPanel() {
  const { machines, changeMachineStatus, resetAllLocalData } = useAndon();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-xl font-bold uppercase tracking-wider text-foreground">
        Simulação de máquinas
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Esta fase permite trocar manualmente o status das máquinas. No futuro virá do Node-RED.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {machines.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
          >
            <div>
              <div className="text-3xl font-black">{m.id}</div>
              <div
                className={
                  "text-xs font-bold uppercase " +
                  (m.machineStatus === "running" ? "text-success" : "text-danger")
                }
              >
                {m.machineStatus === "running" ? "Pronta para rodar" : "Em falha"}
              </div>
            </div>
            {m.machineStatus === "running" ? (
              <BigButton
                tone="danger"
                size="md"
                onClick={() => changeMachineStatus(m.id, "stopped")}
              >
                <Square className="h-5 w-5" /> Gerar falha
              </BigButton>
            ) : (
              <BigButton
                tone="success"
                size="md"
                onClick={() => changeMachineStatus(m.id, "running")}
              >
                <Play className="h-5 w-5" /> Pronta para rodar
              </BigButton>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 border-t border-border pt-4">
        <BigButton tone="danger" size="md" onClick={() => setConfirmReset(true)}>
          <Trash2 className="h-5 w-5" /> Limpar dados locais
        </BigButton>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Limpar todos os dados locais?"
        description="Isso apagará máquinas, chamados, histórico e configurações armazenadas neste navegador. Esta ação não pode ser desfeita."
        confirmLabel="Sim, limpar tudo"
        destructive
        onConfirm={() => {
          resetAllLocalData();
          setConfirmReset(false);
          toast.success("Dados locais limpos");
        }}
      />
    </div>
  );
}
