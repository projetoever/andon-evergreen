import { cn } from "@/lib/utils";
import type { AndonStatus } from "@/types/andon";
import { getAndonStatusLabel } from "@/utils/statusUtils";

interface AndonStatusBadgeProps {
  status: AndonStatus;
  className?: string;
}

const TONE: Record<AndonStatus, string> = {
  none: "bg-muted text-muted-foreground",
  open: "bg-warning/20 text-warning animate-andon-pulse",
  in_progress: "bg-info/20 text-info",
  post_maintenance: "bg-info/20 text-info",
  finished: "bg-success/20 text-success",
};

export function AndonStatusBadge({ status, className }: AndonStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide md:text-sm",
        TONE[status],
        className,
      )}
    >
      ANDON · {getAndonStatusLabel(status)}
    </span>
  );
}
