import type { Machine } from "@/types/machine";
import { StopHistoryList } from "./StopHistoryList";

interface MachineStopHistoryPanelProps {
  machine: Machine;
}

export function MachineStopHistoryPanel({ machine }: MachineStopHistoryPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
        Histórico de falhas
      </h3>
      <StopHistoryList stopHistory={machine.stopHistory} />
    </div>
  );
}
