import { CalendarCheck, CalendarX } from "lucide-react";
import { BigButton } from "@/components/common/BigButton";
import type { Machine, ProductionMode } from "@/types/machine";
import { formatDateTime } from "@/utils/dateTimeUtils";

interface ProductionSchedulePanelProps {
  machine: Machine;
  onChange: (productionMode: ProductionMode) => void;
}

export function ProductionSchedulePanel({ machine, onChange }: ProductionSchedulePanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">
            Programação de Produção
          </h3>
          <p className="text-sm text-muted-foreground">
            Última alteração: {formatDateTime(machine.productionModeChangedAt)}
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {machine.productionMode === "scheduled" ? "Produção Programada" : "Fora de Produção"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BigButton
          tone="success"
          onClick={() => onChange("scheduled")}
          disabled={machine.productionMode === "scheduled"}
        >
          <CalendarCheck className="h-6 w-6" /> Produção Programada
        </BigButton>
        <BigButton
          tone="neutral"
          onClick={() => onChange("not_scheduled")}
          disabled={machine.productionMode === "not_scheduled"}
        >
          <CalendarX className="h-6 w-6" /> Fora de Produção
        </BigButton>
      </div>
    </div>
  );
}
