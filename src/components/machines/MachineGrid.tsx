import type { Machine } from "@/types/machine";
import { MachineCard } from "./MachineCard";

interface MachineGridProps {
  machines: Machine[];
  onOpenCall?: (machineId: string) => void;
  onAttend?: (callId: string) => void;
  onFinish?: (callId: string) => void;
  onCompleteMaintenance?: (callId: string) => void;
}

export function MachineGrid({
  machines,
  onOpenCall,
  onAttend,
  onFinish,
  onCompleteMaintenance,
}: MachineGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
      {machines.map((m) => (
        <MachineCard
          key={m.id}
          machine={m}
          onOpenCall={onOpenCall}
          onAttend={onAttend}
          onFinish={onFinish}
          onCompleteMaintenance={onCompleteMaintenance}
        />
      ))}
    </div>
  );
}
