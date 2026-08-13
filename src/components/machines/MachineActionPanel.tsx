import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCheck,
  FileWarning,
  History,
  RotateCcw,
  Wrench,
  XCircle,
} from "lucide-react";

import { BigButton } from "@/components/common/BigButton";
import type { AndonCall, CallSubtype } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { AndonCategoryConfig } from "@/types/settings";

interface MachineActionPanelProps {
  machine: Machine;
  currentCall: AndonCall | null;
  categories: AndonCategoryConfig[];
  activeSubtypes: Set<CallSubtype>;
  onOpenSubtype: (subtype: CallSubtype) => void;
  onAttend: () => void;
  onCancelCall: () => void;
  onFinish: () => void;
  onCompleteMaintenance: () => void;
  onReturnToMaintenance: () => void;
  screenLocked?: boolean;
}

function readableTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 145 ? "#071015" : "#FFFFFF";
}

export function MachineActionPanel({
  machine,
  currentCall,
  categories,
  activeSubtypes,
  onOpenSubtype,
  onAttend,
  onCancelCall,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
  screenLocked = false,
}: MachineActionPanelProps) {
  const secondaryActionClass =
    "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 text-[11px] font-bold uppercase tracking-wide text-foreground hover:bg-accent md:text-xs";

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-2.5 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
          Abrir novo chamado
        </h3>
        <p className="text-xs text-muted-foreground">
          Toque no setor para informar a condição e abrir. Setores ativos ficam bloqueados.
        </p>
      </div>

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}
      >
        {categories.map((category) => {
          const active = activeSubtypes.has(category.id);
          return (
            <button
              key={category.id}
              type="button"
              disabled={active}
              onClick={() => onOpenSubtype(category.id)}
              className="min-h-11 rounded-lg border-2 px-2 py-1.5 text-sm font-black uppercase tracking-wide shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
              style={
                active
                  ? undefined
                  : {
                      backgroundColor: category.color,
                      borderColor: category.color,
                      color: readableTextColor(category.color),
                    }
              }
            >
              <span>{category.displayName}</span>
              {active && (
                <span className="ml-1 text-[10px] normal-case tracking-normal">· ativo</span>
              )}
            </button>
          );
        })}
      </div>

      {currentCall && (
        <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2 lg:grid-cols-3">
          {currentCall.status === "open" && (
            <BigButton tone="info" size="md" className="min-h-9 px-2 text-xs" onClick={onAttend}>
              <Wrench className="h-4 w-4" /> Atender selecionado
            </BigButton>
          )}
          {currentCall.status === "open" &&
            !currentCall.attendedAt &&
            !(currentCall.technicianSessions ?? []).length && (
              <BigButton
                tone="danger"
                size="md"
                className="min-h-9 px-2 text-xs"
                onClick={onCancelCall}
              >
                <XCircle className="h-4 w-4" /> Cancelar selecionado
              </BigButton>
            )}
          {currentCall.status === "in_progress" && currentCall.category === "maintenance" && (
            <BigButton
              tone="info"
              size="md"
              className="min-h-9 px-2 text-xs"
              onClick={onCompleteMaintenance}
            >
              <CheckCheck className="h-4 w-4" /> Concluir manutenção
            </BigButton>
          )}
          {currentCall.status === "in_progress" && currentCall.category === "production" && (
            <BigButton tone="success" size="md" className="min-h-9 px-2 text-xs" onClick={onFinish}>
              <CheckCheck className="h-4 w-4" /> Finalizar
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && currentCall.category === "maintenance" && (
            <BigButton
              tone="info"
              size="md"
              className="min-h-9 px-2 text-xs"
              onClick={onReturnToMaintenance}
            >
              <RotateCcw className="h-4 w-4" /> Voltar à manutenção
            </BigButton>
          )}
          {currentCall.status === "post_maintenance" && (
            <BigButton tone="success" size="md" className="min-h-9 px-2 text-xs" onClick={onFinish}>
              <CheckCheck className="h-4 w-4" /> Finalizar chamado
            </BigButton>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 border-t border-border pt-2 lg:grid-cols-3">
        <Link
          to="/machines/$machineId/call-history"
          params={{ machineId: machine.id }}
          className={secondaryActionClass}
        >
          <History className="h-4 w-4" /> Histórico de chamados
        </Link>
        <Link
          to="/machines/$machineId/failure-history"
          params={{ machineId: machine.id }}
          className={secondaryActionClass}
        >
          <FileWarning className="h-4 w-4" /> Histórico de falhas
        </Link>
        {!screenLocked && (
          <Link to="/" className={secondaryActionClass}>
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel
          </Link>
        )}
      </div>
    </section>
  );
}
