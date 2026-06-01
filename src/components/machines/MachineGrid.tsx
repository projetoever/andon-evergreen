import type { Machine } from "@/types/machine";
import { cn } from "@/lib/utils";
import { MachineCard } from "./MachineCard";

interface MachineGridProps {
  machines: Machine[];
  className?: string;
  onOpenCall?: (machineId: string) => void;
  onAttend?: (callId: string) => void;
  onFinish?: (callId: string) => void;
  onCompleteMaintenance?: (callId: string) => void;
  onReturnToMaintenance?: (callId: string) => void;
}

export function MachineGrid({
  machines,
  className,
  onOpenCall,
  onAttend,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
}: MachineGridProps) {
  return (
    <div
      className={cn(
        "grid h-full min-h-0 auto-rows-fr grid-cols-2 items-stretch gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7",
        className,
      )}
    >
      {machines.map((m) => (
        <MachineCard
          key={m.id}
          machine={m}
          onOpenCall={onOpenCall}
          onAttend={onAttend}
          onFinish={onFinish}
          onCompleteMaintenance={onCompleteMaintenance}
          onReturnToMaintenance={onReturnToMaintenance}
        />
      ))}
    </div>
  );
}
