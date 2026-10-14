import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { MachineStatus } from "@/types/machine";
import { getMachineStatusLabel } from "@/utils/statusUtils";

interface MachineStatusBadgeProps {
  status: MachineStatus;
  className?: string;
}

export function MachineStatusBadge({ status, className }: MachineStatusBadgeProps) {
  const isRunning = status === "running";
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
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
      {t(getMachineStatusLabel(status))}
    </span>
  );
}
