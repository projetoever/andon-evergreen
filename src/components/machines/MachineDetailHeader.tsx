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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center gap-3 md:gap-4">
        <Link
          to="/"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-12 md:w-12"
          aria-label="Voltar ao painel"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
        </Link>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Máquina
          </div>
          <div className="text-4xl font-black leading-none text-foreground md:text-5xl">{machine.id}</div>
          <div className="mt-0.5 text-sm text-muted-foreground md:text-base">{machine.name}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleMachineSound}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
          title={machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
          aria-label={machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
        >
          {machineSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {machineSoundEnabled ? "Som do ANDON: Ativo" : "Som do ANDON: Silenciado"}
        </button>
        <MachineStatusBadge status={machine.machineStatus} className="text-sm md:text-base" />
        <AndonStatusBadge status={machine.andonStatus} className="text-sm md:text-base" />
        <ProductionModeBadge productionMode={machine.productionMode} className="text-sm md:text-base" />
      </div>
    </div>
  );
}
