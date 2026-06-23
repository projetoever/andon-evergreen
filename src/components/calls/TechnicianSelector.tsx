import { useMemo, useState } from "react";
import { getActiveTechniciansForArea } from "@/services/technicianConfigService";
import { getCurrentShiftFromConfig, getTechnicianShiftFilterConfig } from "@/services/technicianShiftFilterService";
import type { TechnicianArea } from "@/types/andon";
import type { TechnicianConfig } from "@/types/settings";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { cn } from "@/lib/utils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string[];
  onChange: (names: string[]) => void;
  excludeNames?: string[];
  optionalAreas?: TechnicianArea[];
}

const AREA_LABELS: Record<TechnicianArea, string> = {
  electrical: "eletricistas",
  mechanical: "mecânicos",
  hot_melt: "hot melt",
};

function uniqueByName(technicians: TechnicianConfig[]): TechnicianConfig[] {
  const map = new Map<string, TechnicianConfig>();

  for (const technician of technicians) {
    if (!map.has(technician.name)) {
      map.set(technician.name, technician);
    }
  }

  return Array.from(map.values());
}

export function TechnicianSelector({
  area,
  value,
  onChange,
  excludeNames = [],
  optionalAreas = [],
}: TechnicianSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  const [visibleOptionalAreas, setVisibleOptionalAreas] = useState<TechnicianArea[]>([]);

  const normalizedOptionalAreas = useMemo(
    () => optionalAreas.filter((optionalArea) => optionalArea !== area),
    [area, optionalAreas],
  );

  const hiddenOptionalAreas = normalizedOptionalAreas.filter(
    (optionalArea) => !visibleOptionalAreas.includes(optionalArea),
  );

  const visibleAreas = useMemo(
    () => [area, ...visibleOptionalAreas],
    [area, visibleOptionalAreas],
  );

  const { list, hasShiftFallback } = useMemo(() => {
    const excluded = new Set(excludeNames);

    const allActive = uniqueByName(
      visibleAreas.flatMap((currentArea) => getActiveTechniciansForArea(currentArea)),
    ).filter((technician) => !excluded.has(technician.name));

    const config = getTechnicianShiftFilterConfig();

    if (!config.filterByCurrentShift || showAll) return { list: allActive, hasShiftFallback: false };

    const currentShift = getCurrentShiftFromConfig();
    if (!currentShift) return { list: allActive, hasShiftFallback: false };

    const inShift = allActive.filter((technician) => technician.shiftId === currentShift.id);
    if (inShift.length > 0) return { list: inShift, hasShiftFallback: false };

    return { list: allActive, hasShiftFallback: true };
  }, [visibleAreas, showAll, excludeNames]);

  function toggleTechnician(name: string) {
    if (value.includes(name)) return onChange(value.filter((selected) => selected !== name));
    onChange([...value, name]);
  }

  function showOptionalArea(optionalArea: TechnicianArea) {
    setVisibleOptionalAreas((current) => (
      current.includes(optionalArea) ? current : [...current, optionalArea]
    ));
  }

  function getShiftName(shiftId: string): string {
    const shift = getShiftConfigs().find((item) => item.id === shiftId);
    return shift?.name ?? "Não informado";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {hasShiftFallback && (
          <p className="text-xs text-muted-foreground">
            Nenhum manutentor ativo no turno atual. Exibindo todos os ativos.
          </p>
        )}

        {!showAll && !hasShiftFallback && getTechnicianShiftFilterConfig().filterByCurrentShift && (
          <button type="button" className="text-xs font-semibold text-primary underline" onClick={() => setShowAll(true)}>
            Mostrar todos do turno/cadastro
          </button>
        )}

        {hiddenOptionalAreas.map((optionalArea) => (
          <button
            key={optionalArea}
            type="button"
            className="text-xs font-semibold text-primary underline"
            onClick={() => showOptionalArea(optionalArea)}
          >
            Mostrar {AREA_LABELS[optionalArea]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum manutentor cadastrado para esta seleção.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((technician) => {
            const selected = value.includes(technician.name);

            return (
              <button
                key={technician.id || technician.name}
                type="button"
                onClick={() => toggleTechnician(technician.name)}
                className={cn(
                  "min-h-[64px] rounded-xl border-2 p-3 text-base font-bold transition-all",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-accent",
                )}
              >
                <div>{technician.name}</div>
                <div className="text-xs opacity-80">{AREA_LABELS[technician.area] ?? technician.area}</div>
                <div className="text-xs opacity-80">{getShiftName(technician.shiftId)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
