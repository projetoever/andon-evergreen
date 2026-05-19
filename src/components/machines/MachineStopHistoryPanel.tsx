import type { Machine } from "@/types/machine";
import { StopHistoryList } from "./StopHistoryList";

interface MachineStopHistoryPanelProps {
  machine: Machine;
  onUpdateFailureDescription: (stopEventId: string, failureDescription: string) => void;
}

export function MachineStopHistoryPanel({ machine, onUpdateFailureDescription }: MachineStopHistoryPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 md:p-4">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
        Histórico de falhas
      </h3>
      <div className="max-h-56 overflow-y-auto">
        <StopHistoryList
          machineId={machine.id}
          stopHistory={machine.stopHistory}
          onUpdateFailureDescription={onUpdateFailureDescription}
        />
      </div>
    </div>
  );
}
