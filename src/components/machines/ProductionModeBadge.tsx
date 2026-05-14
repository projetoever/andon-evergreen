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
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wider",
        isScheduled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {getProductionModeLabel(productionMode)}
    </span>
  );
}
