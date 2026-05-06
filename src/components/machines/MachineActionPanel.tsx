import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, RotateCcw, Wrench, Play, Square } from "lucide-react";
import type { Machine } from "@/types/machine";
import type { AndonCall } from "@/types/andon";
import { BigButton } from "@/components/common/BigButton";

interface MachineActionPanelProps {
  machine: Machine;
  currentCall: AndonCall | null;
  onOpenCall: () => void;
  onAttend: () => void;
  onFinish: () => void;
  onCompleteMaintenance: () => void;
  onReturnToMaintenance: () => void;
  onStop: () => void;
  onResume: () => void;
}

export function MachineActionPanel({
  machine,
  currentCall,
  onOpenCall,
  onAttend,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
  onStop,
  onResume,
}: MachineActionPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-lg font-bold uppercase tracking-wider text-foreground">Ações</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {machine.andonStatus === "none" && (
          <BigButton tone="warning" onClick={onOpenCall}>
            <Bell className="h-6 w-6" /> Abrir ANDON
          </BigButton>
        )}
        {currentCall?.status === "open" && (
          <BigButton tone="info" onClick={onAttend}>
            <Wrench className="h-6 w-6" /> Atender
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "maintenance" && (
          <BigButton tone="info" onClick={onCompleteMaintenance}>
            <CheckCheck className="h-6 w-6" /> Concluir Manutenção
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "production" && (
          <BigButton tone="success" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && currentCall.category === "maintenance" && (
          <BigButton tone="info" onClick={onReturnToMaintenance}>
            <RotateCcw className="h-6 w-6" /> Voltar à Manutenção
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && (
          <BigButton tone="success" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar Chamado
          </BigButton>
        )}
        <BigButton tone="danger" onClick={onStop} disabled={machine.machineStatus === "stopped"}>
          <Square className="h-6 w-6" /> Gerar Parada
        </BigButton>
        <BigButton tone="success" onClick={onResume} disabled={machine.machineStatus === "running"}>
          <Play className="h-6 w-6" /> Voltar a Rodar
        </BigButton>
        <Link
          to="/"
          className="inline-flex min-h-[72px] items-center justify-center gap-3 rounded-xl border border-border bg-background px-8 text-xl font-bold uppercase tracking-wider text-foreground hover:bg-accent"
        >
          <ArrowLeft className="h-6 w-6" /> Voltar ao Painel
        </Link>
      </div>
    </div>
  );
}
