import { useMemo, useState } from "react";
import { getActiveTechniciansForArea } from "@/services/technicianConfigService";
import { getCurrentShiftFromConfig, getTechnicianShiftFilterConfig } from "@/services/technicianShiftFilterService";
import type { TechnicianArea } from "@/types/andon";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { cn } from "@/lib/utils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string[];
  onChange: (names: string[]) => void;
  excludeNames?: string[];
}

export function TechnicianSelector({ area, value, onChange, excludeNames = [] }: TechnicianSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  const { list, hasShiftFallback } = useMemo(() => {
    const allActive = getActiveTechniciansForArea(area).filter((t) => !excludeNames.includes(t.name));
    const config = getTechnicianShiftFilterConfig();
    if (!config.filterByCurrentShift || showAll) return { list: allActive, hasShiftFallback: false };
    const currentShift = getCurrentShiftFromConfig();
    if (!currentShift) return { list: allActive, hasShiftFallback: false };
    const inShift = allActive.filter((technician) => technician.shiftId === currentShift.id);
    if (inShift.length > 0) return { list: inShift, hasShiftFallback: false };
    return { list: allActive, hasShiftFallback: true };
  }, [area, showAll, excludeNames]);

  function toggleTechnician(name: string) {
    if (value.includes(name)) return onChange(value.filter((selected) => selected !== name));
    onChange([...value, name]);
  }

  function getShiftName(shiftId: string): string {
    const shift = getShiftConfigs().find((item) => item.id === shiftId);
    return shift?.name ?? "Não informado";
  }

  if (list.length === 0) return <p className="text-sm text-muted-foreground">Nenhum manutentor cadastrado para esta área.</p>;

  return (
    <div className="space-y-2">
      {hasShiftFallback && <p className="text-xs text-muted-foreground">Nenhum manutentor ativo no turno atual. Exibindo todos os ativos.</p>}
      {!showAll && !hasShiftFallback && getTechnicianShiftFilterConfig().filterByCurrentShift && (
        <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setShowAll(true)}>Mostrar todos</button>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((t) => {
          const selected = value.includes(t.name);
          return (
            <button key={t.id} type="button" onClick={() => toggleTechnician(t.name)} className={cn("min-h-[64px] rounded-xl border-2 p-3 text-base font-bold transition-all", selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-accent")}>
              <div>{t.name}</div><div className="text-xs opacity-80">{getShiftName(t.shiftId)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
