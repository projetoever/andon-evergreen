import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bell, CheckCheck, Wrench, Play, Square } from "lucide-react";
import type { Machine } from "@/types/machine";
import type { AndonCall } from "@/types/andon";
import { BigButton } from "@/components/common/BigButton";

interface MachineActionPanelProps {
  machine: Machine;
  currentCall: AndonCall | null;
  onOpenCall: () => void;
  onAttend: () => void;
  onFinish: () => void;
  onStop: () => void;
  onResume: () => void;
}

export function MachineActionPanel({
  machine,
  currentCall,
  onOpenCall,
  onAttend,
  onFinish,
  onStop,
  onResume,
}: MachineActionPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-lg font-bold uppercase tracking-wider text-foreground">
        Ações
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BigButton
          tone="warning"
          onClick={onOpenCall}
          disabled={machine.andonStatus !== "none"}
        >
          <Bell className="h-6 w-6" /> Abrir ANDON
        </BigButton>
        <BigButton
          tone="info"
          onClick={onAttend}
          disabled={!currentCall || currentCall.status !== "open"}
        >
          <Wrench className="h-6 w-6" /> Atender
        </BigButton>
        <BigButton
          tone="success"
          onClick={onFinish}
          disabled={!currentCall || currentCall.status === "finished"}
        >
          <CheckCheck className="h-6 w-6" /> Finalizar
        </BigButton>
        <BigButton
          tone="danger"
          onClick={onStop}
          disabled={machine.machineStatus === "stopped"}
        >
          <Square className="h-6 w-6" /> Gerar Parada
        </BigButton>
        <BigButton
          tone="success"
          onClick={onResume}
          disabled={machine.machineStatus === "running"}
        >
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
