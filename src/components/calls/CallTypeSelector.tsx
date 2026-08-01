import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import type { CallSubtype } from "@/types/andon";
import { cn } from "@/lib/utils";

interface CallTypeSelectorProps {
  value: CallSubtype | null;
  onChange: (subtype: CallSubtype) => void;
}

export function CallTypeSelector({ value, onChange }: CallTypeSelectorProps) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Tipo de chamado
      </h4>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {CALL_TYPE_OPTIONS.map((opt) => {
          const isSelected = value === opt.id;
          const isMaintenance = opt.category === "maintenance";

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-[72px] flex-col items-center justify-center rounded-xl border-2 px-2.5 py-2 text-center transition-all hover:scale-[1.01]",
                isSelected && isMaintenance
                  ? "border-warning bg-warning text-warning-foreground shadow-md ring-2 ring-ring/30"
                  : isSelected
                    ? "border-info bg-info text-info-foreground shadow-md ring-2 ring-ring/30"
                    : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
                {isMaintenance ? "Manutenção" : "Produção"}
              </span>
              <span className="mt-0.5 text-base font-black leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
