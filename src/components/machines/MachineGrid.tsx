import type { Machine } from "@/types/machine";
import { cn } from "@/lib/utils";
import { MachineCard } from "./MachineCard";

interface MachineGridProps {
  machines: Machine[];
  className?: string;
}

export function MachineGrid({ machines, className }: MachineGridProps) {
  return (
    <div
      className={cn(
        "grid auto-rows-[minmax(250px,1fr)] grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7",
        className,
      )}
    >
      {machines.map((m) => (
        <MachineCard key={m.id} machine={m} />
      ))}
    </div>
  );
}
