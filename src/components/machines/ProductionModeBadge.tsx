import { CalendarCheck, CalendarX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductionMode } from "@/types/machine";
import { getProductionModeLabel } from "@/utils/statusUtils";

interface ProductionModeBadgeProps {
  productionMode: ProductionMode;
  className?: string;
}

export function ProductionModeBadge({ productionMode, className }: ProductionModeBadgeProps) {
  const isScheduled = productionMode === "scheduled";
  const Icon = isScheduled ? CalendarCheck : CalendarX;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide md:text-sm",
        isScheduled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
      {getProductionModeLabel(productionMode)}
    </span>
  );
}
