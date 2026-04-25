import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { Machine } from "@/types/machine";
import { MachineStatusBadge } from "./MachineStatusBadge";
import { AndonStatusBadge } from "./AndonStatusBadge";

interface MachineDetailHeaderProps {
  machine: Machine;
}

export function MachineDetailHeader({ machine }: MachineDetailHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-muted hover:bg-accent"
          aria-label="Voltar ao painel"
        >
          <ArrowLeft className="h-7 w-7" />
        </Link>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Máquina
          </div>
          <div className="text-6xl font-black leading-none text-foreground">{machine.id}</div>
          <div className="mt-1 text-base text-muted-foreground">{machine.name}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <MachineStatusBadge status={machine.machineStatus} className="text-base" />
        <AndonStatusBadge status={machine.andonStatus} className="text-base" />
      </div>
    </div>
  );
}
