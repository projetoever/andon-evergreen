import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, History, RotateCcw, Wrench, Play, Square, FileWarning } from "lucide-react";
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
    <div className="rounded-xl border border-border bg-card p-3 shadow-md">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground md:text-base">Ações</h3>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {machine.andonStatus === "none" && (
          <BigButton tone="warning" size="md" className="min-h-[44px] px-3 text-sm" onClick={onOpenCall}>
            <Bell className="h-6 w-6" /> Abrir ANDON
          </BigButton>
        )}
        {currentCall?.status === "open" && (
          <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onAttend}>
            <Wrench className="h-6 w-6" /> Atender
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onCompleteMaintenance}>
            <CheckCheck className="h-6 w-6" /> Concluir Manutenção
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "production" && (
          <BigButton tone="success" size="md" className="min-h-[44px] px-3 text-sm" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onReturnToMaintenance}>
            <RotateCcw className="h-6 w-6" /> Voltar à Manutenção
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && (
          <BigButton tone="success" size="md" className="min-h-[44px] px-3 text-sm" onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar Chamado
          </BigButton>
        )}
        <BigButton tone="danger" size="md" className="min-h-[44px] px-3 text-sm" onClick={onStop} disabled={machine.machineStatus === "stopped"}>
          <Square className="h-6 w-6" /> Gerar Falha
        </BigButton>
        <BigButton tone="success" size="md" className="min-h-[44px] px-3 text-sm" onClick={onResume} disabled={machine.machineStatus === "running"}>
          <Play className="h-6 w-6" /> Pronta para Rodar
        </BigButton>
        <Link
          to="/machines/$machineId/call-history"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-sm"
        >
          <History className="h-6 w-6" /> Histórico de Chamados
        </Link>
        <Link
          to="/machines/$machineId/failure-history"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-sm"
        >
          <FileWarning className="h-6 w-6" /> Histórico de Falhas
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-sm"
        >
          <ArrowLeft className="h-6 w-6" /> Voltar ao Painel
        </Link>
      </div>
    </div>
  );
}
