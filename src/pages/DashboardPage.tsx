import { useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { StatusSummaryBar } from "@/components/layout/StatusSummaryBar";
import { MachineGrid } from "@/components/machines/MachineGrid";
import { OpenCallModal } from "@/components/calls/OpenCallModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { BigButton } from "@/components/common/BigButton";
import { unlockAudio } from "@/services/soundService";
import { Volume2, Plus } from "lucide-react";
import { toast } from "sonner";

export function DashboardPage() {
  const { machines, audioUnlocked, setAudioUnlocked, attendCall } = useAndon();
  const [openMachineId, setOpenMachineId] = useState<string | null>(null);
  const [openCallDialog, setOpenCallDialog] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);

  function handleUnlock() {
    unlockAudio();
    setAudioUnlocked(true);
    toast.success("Painel ativo — sons habilitados");
  }

  function handleOpenCall(machineId?: string) {
    setOpenMachineId(machineId ?? null);
    setOpenCallDialog(true);
  }

  function handleAttend(callId: string) {
    try {
      attendCall(callId);
      toast.success("Chamado em atendimento");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      {!audioUnlocked && (
        <div className="flex flex-col items-center justify-between gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4 text-warning sm:flex-row">
          <div className="flex items-center gap-3">
            <Volume2 className="h-6 w-6" />
            <span className="text-base font-bold">
              Toque em "Iniciar Painel" para liberar os sons dos chamados.
            </span>
          </div>
          <BigButton tone="primary" size="md" onClick={handleUnlock}>
            INICIAR PAINEL / ATIVAR SONS
          </BigButton>
        </div>
      )}

      <StatusSummaryBar />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold uppercase tracking-wider text-foreground">
          Máquinas
        </h2>
        <BigButton tone="warning" size="md" onClick={() => handleOpenCall()}>
          <Plus className="h-5 w-5" /> Abrir ANDON
        </BigButton>
      </div>

      <MachineGrid
        machines={machines}
        onOpenCall={handleOpenCall}
        onAttend={handleAttend}
        onFinish={setFinishCallId}
      />

      <OpenCallModal
        open={openCallDialog}
        onOpenChange={setOpenCallDialog}
        preselectedMachineId={openMachineId}
      />
      <FinishCallModal
        open={finishCallId !== null}
        onOpenChange={(o) => !o && setFinishCallId(null)}
        callId={finishCallId}
      />
    </div>
  );
}
