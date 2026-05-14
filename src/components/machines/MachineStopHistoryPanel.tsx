import type { Machine } from "@/types/machine";
import { StopHistoryList } from "./StopHistoryList";

interface MachineStopHistoryPanelProps {
  machine: Machine;
}

export function MachineStopHistoryPanel({ machine }: MachineStopHistoryPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-lg font-bold uppercase tracking-wider text-foreground">
        Histórico de falhas
      </h3>
      <StopHistoryList stopHistory={machine.stopHistory} />
    </div>
  );
}
