import { Link } from "@tanstack/react-router";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import type { Machine } from "@/types/machine";
import { MachineStatusBadge } from "./MachineStatusBadge";
import { AndonStatusBadge } from "./AndonStatusBadge";
import { ProductionModeBadge } from "./ProductionModeBadge";

interface MachineDetailHeaderProps {
  machine: Machine;
  machineSoundEnabled: boolean;
  onToggleMachineSound: () => void;
}

export function MachineDetailHeader({ machine, machineSoundEnabled, onToggleMachineSound }: MachineDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 md:gap-3">
        <Link
          to="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-10 md:w-10"
          aria-label="Voltar ao painel"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Máquina
          </div>
          <div className="text-3xl font-black leading-none text-foreground md:text-4xl">{machine.id}</div>
          <div className="mt-0.5 text-xs text-muted-foreground md:text-sm">{machine.name}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleMachineSound}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide"
          title={machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
          aria-label={machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
        >
          {machineSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
        </button>
        <MachineStatusBadge status={machine.machineStatus} className="text-xs md:text-sm" />
        <AndonStatusBadge status={machine.andonStatus} className="text-xs md:text-sm" />
        <ProductionModeBadge productionMode={machine.productionMode} className="text-xs md:text-sm" />
      </div>
    </div>
  );
}
