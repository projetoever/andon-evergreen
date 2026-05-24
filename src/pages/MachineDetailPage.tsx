import { useEffect, useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { MachineDetailHeader } from "@/components/machines/MachineDetailHeader";
import { MachineCurrentStatusPanel } from "@/components/machines/MachineCurrentStatusPanel";
import { MachineCurrentCallPanel } from "@/components/machines/MachineCurrentCallPanel";
import { MachineActionPanel } from "@/components/machines/MachineActionPanel";
import { ProductionSchedulePanel } from "@/components/machines/ProductionSchedulePanel";
import { OpenCallModal } from "@/components/calls/OpenCallModal";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { EmptyState } from "@/components/common/EmptyState";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { isMachineSoundEnabled, setMachineSoundEnabled } from "@/services/machineSoundPreferenceService";
import { playAndonSound, stopAndonSound } from "@/services/soundService";

interface MachineDetailPageProps {
  machineId: string;
}

export function MachineDetailPage({ machineId }: MachineDetailPageProps) {
  const {
    machines,
    calls,
    attendCall,
    completeMaintenance,
    returnToMaintenance,
    changeMachineStatus,
    updateMachineProductionMode,
    soundConfigs,
    settings,
    audioUnlocked,
  } = useAndon();
  const machine = machines.find((m) => m.id === machineId);
  const [openCallDialog, setOpenCallDialog] = useState(false);
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [machineSoundEnabled, setMachineSoundEnabledState] = useState(true);

  if (!machine) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  useEffect(() => {
    setMachineSoundEnabledState(isMachineSoundEnabled(machine.id));
  }, [machine.id]);

  const currentCall = machine.currentCallId
    ? (calls.find((c) => c.id === machine.currentCallId) ?? null)
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

  function handleCompleteMaintenance() {
    if (!currentCall) return;
    try {
      completeMaintenance(currentCall.id);
      toast.success("Manutenção concluída. Chamado em acompanhamento");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleReturnToMaintenance() {
    if (!currentCall) return;
    try {
      returnToMaintenance(currentCall.id);
      toast.success("Chamado voltou à manutenção");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleStop() {
    changeMachineStatus(machine!.id, "stopped");
    toast.warning(`Máquina ${machine!.id} marcada como Em falha`);
  }
  function handleResume() {
    changeMachineStatus(machine!.id, "running");
    toast.success(`Máquina ${machine!.id} marcada como Pronta para rodar`);
  }

  function handleProductionModeChange(productionMode: typeof machine.productionMode) {
    try {
      updateMachineProductionMode(machine!.id, productionMode);
      toast.success(
        productionMode === "scheduled"
          ? "Máquina marcada com Produção Programada"
          : "Máquina marcada como Fora de Produção",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleToggleMachineSound() {
    const next = !machineSoundEnabled;
    setMachineSoundEnabled(machine.id, next);
    setMachineSoundEnabledState(next);
    if (!next) {
      stopAndonSound(machine.id);
      toast.success("Som do ANDON silenciado para esta máquina");
      return;
    }
    const shouldReplay = currentCall?.status === "open" && settings.soundsEnabled && audioUnlocked;
    if (shouldReplay) {
      const cfg = soundConfigs.find((item) => item.key === currentCall.subtype);
      const repeatInterval = cfg?.repeatUntilAttended ? cfg.repeatIntervalSeconds : 0;
      void playAndonSound(machine.id, currentCall.subtype, repeatInterval);
    }
    toast.success("Som do ANDON ativado para esta máquina");
  }

  return (
    <div className="space-y-3">
      <MachineDetailHeader
        machine={machine}
        machineSoundEnabled={machineSoundEnabled}
        onToggleMachineSound={handleToggleMachineSound}
      />
      <ProductionSchedulePanel machine={machine} onChange={handleProductionModeChange} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <MachineCurrentStatusPanel machine={machine} />
        <MachineCurrentCallPanel call={currentCall} />
      </div>
      <MachineActionPanel
        machine={machine}
        currentCall={currentCall}
        onOpenCall={() => setOpenCallDialog(true)}
        onAttend={handleAttend}
        onFinish={() => currentCall && setFinishCallId(currentCall.id)}
        onCompleteMaintenance={handleCompleteMaintenance}
        onReturnToMaintenance={handleReturnToMaintenance}
        onStop={handleStop}
        onResume={handleResume}
      />

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
