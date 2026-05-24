import { useMemo } from "react";
import { getTechniciansForSelector } from "@/services/technicianConfigService";
import type { TechnicianArea } from "@/types/andon";
import { cn } from "@/lib/utils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string[];
  onChange: (names: string[]) => void;
}

export function TechnicianSelector({ area, value, onChange }: TechnicianSelectorProps) {
  const list = useMemo(() => getTechniciansForSelector(area), [area]);

  function toggleTechnician(name: string) {
    if (value.includes(name)) {
      onChange(value.filter((selected) => selected !== name));
      return;
    }
    onChange([...value, name]);
  }

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum manutentor cadastrado para esta área.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((t) => {
        const selected = value.includes(t.name);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggleTechnician(t.name)}
            className={cn(
              "min-h-[64px] rounded-xl border-2 p-3 text-base font-bold transition-all",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-accent",
            )}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
