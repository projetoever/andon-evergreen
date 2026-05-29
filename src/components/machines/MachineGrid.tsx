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
        "grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-stretch gap-3 md:gap-4",
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
