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
    <div className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
      <div className="w-full min-w-0 sm:w-auto sm:min-w-[220px] sm:shrink-0">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
          {t("Programação de Produção")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("Última alteração")}: {formatDateTime(machine.productionModeChangedAt)}
        </p>
      </div>
      <div className="grid w-full min-w-0 grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 sm:w-auto sm:flex-1">
        <button
          onClick={() => onChange("scheduled")}
          disabled={machine.productionMode === "scheduled"}
          className={
            "inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-2 text-xs font-bold uppercase tracking-wide transition-all sm:flex-1 sm:px-3 " +
            (machine.productionMode === "scheduled"
              ? "bg-success text-success-foreground"
              : "text-foreground hover:bg-accent")
          }
        >
          <CalendarCheck className="h-4 w-4 shrink-0" />
          <span className="min-w-0 whitespace-normal break-words text-center leading-tight">{t("Produção Programada")}</span>
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
          <span className="min-w-0 whitespace-normal break-words text-center leading-tight">{t("Fora de Produção")}</span>
        </button>
      </div>
      <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground xl:inline-flex">
        {machine.productionMode === "scheduled" ? t("Produção Programada") : t("Fora de Produção")}
      </span>
    </div>
  );
}
