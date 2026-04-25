import { useMemo } from "react";
import { TECHNICIANS } from "@/data/technicians";
import type { TechnicianArea } from "@/types/andon";
import { cn } from "@/lib/utils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string | null;
  onChange: (name: string) => void;
}

export function TechnicianSelector({ area, value, onChange }: TechnicianSelectorProps) {
  const list = useMemo(
    () => TECHNICIANS.filter((t) => t.area === area && t.active),
    [area],
  );
  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum manutentor cadastrado para esta área.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.name)}
          className={cn(
            "min-h-[64px] rounded-xl border-2 p-3 text-base font-bold transition-all",
            value === t.name
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
