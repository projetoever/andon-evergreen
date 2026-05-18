import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, History, RotateCcw, Wrench, Play, Square } from "lucide-react";
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
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">Ações</h3>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {machine.andonStatus === "none" && (
          <BigButton tone="warning" size="md" onClick={onOpenCall}>
            <Bell className="h-6 w-6" /> Abrir ANDON
          </BigButton>
        )}
        {currentCall?.status === "open" && (
          <BigButton tone="info" size="md" onClick={onAttend}>
            <Wrench className="h-6 w-6" /> Atender
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" onClick={onCompleteMaintenance}>
            <CheckCheck className="h-6 w-6" /> Concluir Manutenção
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "production" && (
          <BigButton tone="success" size="md" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" onClick={onReturnToMaintenance}>
            <RotateCcw className="h-6 w-6" /> Voltar à Manutenção
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && (
          <BigButton tone="success" size="md" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar Chamado
          </BigButton>
        )}
        <BigButton tone="danger" size="md" onClick={onStop} disabled={machine.machineStatus === "stopped"}>
          <Square className="h-6 w-6" /> Gerar Falha
        </BigButton>
        <BigButton tone="success" size="md" onClick={onResume} disabled={machine.machineStatus === "running"}>
          <Play className="h-6 w-6" /> Pronta para Rodar
        </BigButton>
        <Link
          to="/machines/$machineId/call-history"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-base"
        >
          <History className="h-6 w-6" /> Histórico de Chamados
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-base"
        >
          <ArrowLeft className="h-6 w-6" /> Voltar ao Painel
        </Link>
      </div>
    </div>
  );
}
