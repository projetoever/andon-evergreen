import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import type { CallSubtype } from "@/types/andon";
import { cn } from "@/lib/utils";

interface CallTypeSelectorProps {
  value: CallSubtype | null;
  onChange: (subtype: CallSubtype) => void;
}

export function CallTypeSelector({ value, onChange }: CallTypeSelectorProps) {
  const maintenance = CALL_TYPE_OPTIONS.filter((o) => o.category === "maintenance");
  const production = CALL_TYPE_OPTIONS.filter((o) => o.category === "production");
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Manutenção
        </h4>
        <div className="grid grid-cols-3 gap-2">
          {maintenance.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "min-h-[80px] rounded-xl border-2 p-3 text-base font-bold transition-all",
                value === opt.id
                  ? "border-warning bg-warning text-warning-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Produção
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {production.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={cn(
                "min-h-[80px] rounded-xl border-2 p-3 text-base font-bold transition-all",
                value === opt.id
                  ? "border-info bg-info text-info-foreground"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
