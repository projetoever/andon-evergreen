import { CalendarCheck2, CalendarX2, CircleHelp, CircleCheck, CircleMinus } from "lucide-react";
import type { ProductionMode } from "@/types/machine";
import { ui } from "@/i18n/translate";
import { cn } from "@/lib/utils";

/** Pure visual badges: the authoritative mode and catalog activation come from
 * the existing priority snapshot. They never imply machine runtime or call status.
 */
export function PriorityProductionBadge({ mode }: { mode: ProductionMode | null }) {
  const Icon = mode === "scheduled" ? CalendarCheck2 :
    mode === "not_scheduled" ? CalendarX2 : CircleHelp;
  const label = mode === "scheduled" ? "Produção Programada" :
    mode === "not_scheduled" ? "Fora de Produção" : "Estado desconhecido";
  return (
    <span className={cn(
      "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-bold",
      mode === "scheduled"
        ? "border-emerald-500/60 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100"
        : mode === "not_scheduled"
          ? "border-amber-500/70 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
          : "border-border bg-muted text-foreground",
    )}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="break-words">{ui(label)}</span>
    </span>
  );
}

export function PriorityActivationBadge({ active }: { active: boolean }) {
  const Icon = active ? CircleCheck : CircleMinus;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold",
      active ? "border-border bg-muted/40 text-foreground" :
        "border-border bg-muted text-muted-foreground",
    )}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ui(active ? "Ativa no cadastro" : "Inativa no cadastro")}
    </span>
  );
}
