import { useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { MachineDetailHeader } from "@/components/machines/MachineDetailHeader";
import { MachineCurrentStatusPanel } from "@/components/machines/MachineCurrentStatusPanel";
import { MachineCurrentCallPanel } from "@/components/machines/MachineCurrentCallPanel";
import { MachineStopHistoryPanel } from "@/components/machines/MachineStopHistoryPanel";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
import { OpenCallModal } from "@/components/calls/OpenCallModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { EmptyState } from "@/components/common/EmptyState";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface MachineDetailPageProps {
  machineId: string;
}

export function MachineDetailPage({ machineId }: MachineDetailPageProps) {
  const { machines, calls, attendCall, changeMachineStatus } = useAndon();
  const machine = machines.find((m) => m.id === machineId);
  const [openCallDialog, setOpenCallDialog] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);

  if (!machine) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  const currentCall = machine.currentCallId
    ? calls.find((c) => c.id === machine.currentCallId) ?? null
    : null;

  function handleAttend() {
    if (!currentCall) return;
    try {
      attendCall(currentCall.id);
      toast.success("Chamado em atendimento");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleStop() {
    changeMachineStatus(machine!.id, "stopped");
    toast.warning(`Máquina ${machine!.id} marcada como Parada`);
  }
  function handleResume() {
    changeMachineStatus(machine!.id, "running");
    toast.success(`Máquina ${machine!.id} voltou a Rodar`);
  }

  return (
    <div className="space-y-4">
      <MachineDetailHeader machine={machine} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MachineCurrentStatusPanel machine={machine} />
        <MachineCurrentCallPanel call={currentCall} />
      </div>
      <MachineActionPanel
        machine={machine}
        currentCall={currentCall}
        onOpenCall={() => setOpenCallDialog(true)}
        onAttend={handleAttend}
        onFinish={() => currentCall && setFinishCallId(currentCall.id)}
        onStop={handleStop}
        onResume={handleResume}
      />
      <MachineStopHistoryPanel machine={machine} />

      <OpenCallModal
        open={openCallDialog}
        onOpenChange={setOpenCallDialog}
        preselectedMachineId={machine.id}
      />
      <FinishCallModal
        open={finishCallId !== null}
        onOpenChange={(o) => !o && setFinishCallId(null)}
        callId={finishCallId}
      />
    </div>
  );
}
