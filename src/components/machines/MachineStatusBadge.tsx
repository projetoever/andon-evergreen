import { cn } from "@/lib/utils";
import type { MachineStatus } from "@/types/machine";
import { getMachineStatusLabel } from "@/utils/statusUtils";

interface MachineStatusBadgeProps {
  status: MachineStatus;
  className?: string;
}

export function MachineStatusBadge({ status, className }: MachineStatusBadgeProps) {
  const isRunning = status === "running";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide md:text-sm",
        isRunning
          ? "bg-success/20 text-success"
          : "bg-danger/20 text-danger animate-andon-pulse",
        className,
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          isRunning ? "bg-success" : "bg-danger",
        )}
      />
      {getMachineStatusLabel(status)}
    </span>
  );
}
