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
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider",
        isRunning
          ? "bg-success/20 text-success"
          : "bg-danger/20 text-danger animate-andon-pulse",
        className,
      )}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          isRunning ? "bg-success" : "bg-danger",
        )}
      />
      {getMachineStatusLabel(status)}
    </span>
  );
}
