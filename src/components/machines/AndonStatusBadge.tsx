import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageProvider";
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
  cancelled: "bg-muted text-muted-foreground",
};

export function AndonStatusBadge({ status, className }: AndonStatusBadgeProps) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide",
        TONE[status],
        className,
      )}
    >
      ANDON · {t(getAndonStatusLabel(status))}
    </span>
  );
}
