import { CalendarCheck, CalendarX } from "lucide-react";
import type { Machine, ProductionMode } from "@/types/machine";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { useLanguage } from "@/i18n/LanguageProvider";

interface ProductionSchedulePanelProps {
  machine: Machine;
  onChange: (productionMode: ProductionMode) => void;
}

export function ProductionSchedulePanel({ machine, onChange }: ProductionSchedulePanelProps) {
  const { t } = useLanguage();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 lg:flex-nowrap">
      <div className="min-w-[220px] shrink-0">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
          {t("Programação de Produção")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("Última alteração")}: {formatDateTime(machine.productionModeChangedAt)}
        </p>
      </div>
      <div className="inline-flex min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/40 p-1">
        <button
          onClick={() => onChange("scheduled")}
          disabled={machine.productionMode === "scheduled"}
          className={
            "inline-flex min-h-[34px] flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold uppercase tracking-wide transition-all " +
            (machine.productionMode === "scheduled"
              ? "bg-success text-success-foreground"
              : "text-foreground hover:bg-accent")
          }
        >
          <CalendarCheck className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("Produção Programada")}</span>
        </button>
        <button
          onClick={() => onChange("not_scheduled")}
          disabled={machine.productionMode === "not_scheduled"}
          className={
            "inline-flex min-h-[34px] flex-1 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold uppercase tracking-wide transition-all " +
            (machine.productionMode === "not_scheduled"
              ? "bg-muted text-muted-foreground ring-1 ring-border"
              : "text-foreground hover:bg-accent")
          }
        >
          <CalendarX className="h-4 w-4 shrink-0" />
          <span className="truncate">{t("Fora de Produção")}</span>
        </button>
      </div>
      <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground xl:inline-flex">
        {machine.productionMode === "scheduled" ? t("Produção Programada") : t("Fora de Produção")}
      </span>
    </div>
  );
}
