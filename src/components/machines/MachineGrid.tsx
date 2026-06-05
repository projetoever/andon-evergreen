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
        "grid h-full min-h-0 grid-cols-2 grid-rows-[repeat(7,minmax(0,1fr))] items-stretch gap-1.5 sm:grid-cols-3 sm:grid-rows-[repeat(5,minmax(0,1fr))] md:grid-cols-4 md:grid-rows-[repeat(4,minmax(0,1fr))] lg:grid-cols-5 lg:grid-rows-[repeat(3,minmax(0,1fr))] xl:grid-cols-7 xl:grid-rows-2 2xl:gap-2",
        className,
      )}
    >
      {machines.map((m) => (
        <MachineCard key={m.id} machine={m} />
      ))}
    </div>
  );
}
