import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileWarning,
  History,
  RotateCcw,
  Send,
  Wrench,
  XCircle,
} from "lucide-react";

import { BigButton } from "@/components/common/BigButton";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import type { AndonCall, CallSubtype } from "@/types/andon";
import type { Machine } from "@/types/machine";

interface MachineActionPanelProps {
  machine: Machine;
  currentCall: AndonCall | null;
  selectedSubtypes: CallSubtype[];
  activeSubtypes: Set<CallSubtype>;
  onToggleSubtype: (subtype: CallSubtype) => void;
  onOpenSelected: () => void;
  onAttend: () => void;
  onCancelCall: () => void;
  onFinish: () => void;
  onCompleteMaintenance: () => void;
  onReturnToMaintenance: () => void;
  screenLocked?: boolean;
}

export function MachineActionPanel({
  machine,
  currentCall,
  selectedSubtypes,
  activeSubtypes,
  onToggleSubtype,
  onOpenSelected,
  onAttend,
  onCancelCall,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
  screenLocked = false,
}: MachineActionPanelProps) {
  const secondaryActionClass =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-accent md:text-sm";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-md">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            Abrir novo chamado
          </h3>
          <p className="text-xs text-muted-foreground">
            Selecione um ou mais setores. Setores já ativos ficam bloqueados.
          </p>
        </div>
        {selectedSubtypes.length > 0 && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
            {selectedSubtypes.length} selecionado{selectedSubtypes.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {CALL_TYPE_OPTIONS.map((option) => {
          const active = activeSubtypes.has(option.id);
          const selected = selectedSubtypes.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={active}
              onClick={() => onToggleSubtype(option.id)}
              className={cn(
                "relative min-h-[58px] rounded-xl border-2 px-3 py-2 text-sm font-black uppercase tracking-wide transition-all",
                active && "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60",
                !active && !selected && "border-border bg-background hover:border-primary/50 hover:bg-accent",
                selected && option.category === "maintenance" && "border-warning bg-warning/15 text-warning ring-2 ring-warning/20",
                selected && option.category === "production" && "border-info bg-info/15 text-info ring-2 ring-info/20",
              )}
            >
              {selected && (
                <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
              <span>{option.label}</span>
              {active && <span className="mt-0.5 block text-[10px] normal-case tracking-normal">Chamado ativo</span>}
            </button>
          );
        })}
      </div>

      {selectedSubtypes.length > 0 && (
        <BigButton tone="warning" size="md" className="w-full" onClick={onOpenSelected}>
          <Send className="h-5 w-5" />
          Informar condição e abrir
        </BigButton>
      )}

      {currentCall && (
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 lg:grid-cols-3">
          {currentCall.status === "open" && (
            <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onAttend}>
              <Wrench className="h-5 w-5" /> Atender selecionado
            </BigButton>
          )}
          {currentCall.status === "open" && !currentCall.attendedAt && !(currentCall.technicianSessions ?? []).length && (
            <BigButton tone="danger" size="md" className="min-h-[44px] px-3 text-sm" onClick={onCancelCall}>
              <XCircle className="h-5 w-5" /> Cancelar selecionado
            </BigButton>
          )}
          {currentCall.status === "in_progress" && currentCall.category === "maintenance" && (
            <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onCompleteMaintenance}>
              <CheckCheck className="h-5 w-5" /> Concluir manutenção
            </BigButton>
          )}
          {currentCall.status === "in_progress" && currentCall.category === "production" && (
            <BigButton tone="success" size="md" className="min-h-[44px] px-3 text-sm" onClick={onFinish}>
              <CheckCheck className="h-5 w-5" /> Finalizar
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && currentCall.category === "maintenance" && (
            <BigButton tone="info" size="md" className="min-h-[44px] px-3 text-sm" onClick={onReturnToMaintenance}>
              <RotateCcw className="h-5 w-5" /> Voltar à manutenção
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && (
            <BigButton tone="success" size="md" className="min-h-[44px] px-3 text-sm" onClick={onFinish}>
              <CheckCheck className="h-5 w-5" /> Finalizar chamado
            </BigButton>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 lg:grid-cols-3">
        <Link to="/machines/$machineId/call-history" params={{ machineId: machine.id }} className={secondaryActionClass}>
          <History className="h-5 w-5" /> Histórico de chamados
        </Link>
        <Link to="/machines/$machineId/failure-history" params={{ machineId: machine.id }} className={secondaryActionClass}>
          <FileWarning className="h-5 w-5" /> Histórico de falhas
        </Link>
        {!screenLocked && (
          <Link to="/" className={secondaryActionClass}>
            <ArrowLeft className="h-5 w-5" /> Voltar ao painel
          </Link>
        )}
      </div>
    </div>
  );
}
