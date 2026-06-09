import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, History, RotateCcw, Wrench, Play, Square, FileWarning } from "lucide-react";
import type { Machine } from "@/types/machine";
import type { AndonCall } from "@/types/andon";
import { BigButton } from "@/components/common/BigButton";
import { cn } from "@/lib/utils";

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
  prominentNoCall?: boolean;
  screenLocked?: boolean;
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
  prominentNoCall = false,
  screenLocked = false,
}: MachineActionPanelProps) {
  const actionButtonClass = prominentNoCall
    ? "min-h-[76px] px-5 text-lg md:min-h-[86px] md:text-xl 2xl:min-h-[92px]"
    : "min-h-[44px] px-3 text-sm";
  const primaryActionClass = cn(
    actionButtonClass,
    prominentNoCall && "ring-2 ring-warning/50 shadow-xl shadow-warning/10",
  );
  const dangerActionClass = cn(
    actionButtonClass,
    prominentNoCall && "ring-2 ring-danger/40 shadow-xl shadow-danger/10",
  );
  const secondaryActionClass = prominentNoCall
    ? "inline-flex min-h-[62px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold uppercase tracking-wider text-foreground hover:bg-accent md:min-h-[70px] md:text-base 2xl:min-h-[76px]"
    : "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-sm";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-md",
        prominentNoCall ? "p-4 ring-1 ring-warning/25 md:p-5" : "p-3",
      )}
    >
      <h3 className={cn("font-bold uppercase tracking-wider text-foreground", prominentNoCall ? "mb-4 text-base md:text-lg" : "mb-2 text-sm md:text-base")}>Ações</h3>
      <div className={cn("grid grid-cols-2 lg:grid-cols-3", prominentNoCall ? "gap-3 md:gap-4" : "gap-2")}>
        {machine.andonStatus === "none" && (
          <BigButton tone="warning" size="md" className={primaryActionClass} onClick={onOpenCall}>
            <Bell className="h-6 w-6" /> Abrir ANDON
          </BigButton>
        )}
        {currentCall?.status === "open" && (
          <BigButton tone="info" size="md" className={actionButtonClass} onClick={onAttend}>
            <Wrench className="h-6 w-6" /> Atender
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" className={actionButtonClass} onClick={onCompleteMaintenance}>
            <CheckCheck className="h-6 w-6" /> Concluir Manutenção
          </BigButton>
        )}
        {currentCall?.status === "in_progress" && currentCall.category === "production" && (
          <BigButton tone="success" size="md" className={actionButtonClass} onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && currentCall.category === "maintenance" && (
          <BigButton tone="info" size="md" className={actionButtonClass} onClick={onReturnToMaintenance}>
            <RotateCcw className="h-6 w-6" /> Voltar à Manutenção
          </BigButton>
        )}
        {currentCall?.status === "post_maintenance" && (
          <BigButton tone="success" size="md" className={actionButtonClass} onClick={onFinish}>
            <CheckCheck className="h-6 w-6" /> Finalizar Chamado
          </BigButton>
        )}
        <BigButton tone="danger" size="md" className={dangerActionClass} onClick={onStop} disabled={machine.machineStatus === "stopped"}>
          <Square className="h-6 w-6" /> Gerar Falha
        </BigButton>
        <BigButton tone="success" size="md" className={actionButtonClass} onClick={onResume} disabled={machine.machineStatus === "running"}>
          <Play className="h-6 w-6" /> Pronta para Rodar
        </BigButton>
        <Link
          to="/machines/$machineId/call-history"
          params={{ machineId: machine.id }}
          className={secondaryActionClass}
        >
          <History className="h-6 w-6" /> Histórico de Chamados
        </Link>
        <Link
          to="/machines/$machineId/failure-history"
          params={{ machineId: machine.id }}
          className={secondaryActionClass}
        >
          <FileWarning className="h-6 w-6" /> Histórico de Falhas
        </Link>
        {!screenLocked && (
          <Link
            to="/"
            className={secondaryActionClass}
          >
            <ArrowLeft className="h-6 w-6" /> Voltar ao Painel
          </Link>
        )}
      </div>
    </div>
  );
}
