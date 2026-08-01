import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Search } from "lucide-react";
import { getActiveTechniciansForArea } from "@/services/technicianConfigService";
import {
  getCurrentShiftFromConfig,
  getTechnicianShiftFilterConfig,
} from "@/services/technicianShiftFilterService";
import type { TechnicianArea } from "@/types/andon";
import type { TechnicianConfig } from "@/types/settings";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { cn } from "@/lib/utils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  excludeNames?: string[];
  optionalAreas?: TechnicianArea[];
  variant?: "default" | "compact";
}

const AREA_LABELS: Record<TechnicianArea, string> = {
  electrical: "eletricistas",
  mechanical: "mecânicos",
  hot_melt: "hot melt",
};

const AREA_FILTER_LABELS: Record<TechnicianArea, string> = {
  electrical: "Elétrica",
  mechanical: "Mecânica",
  hot_melt: "Hot Melt",
};

const AREA_ROLE_LABELS: Record<TechnicianArea, string> = {
  electrical: "Eletricista",
  mechanical: "Mecânico",
  hot_melt: "Hot Melt",
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
  variant = "default",
}: TechnicianSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  const [visibleOptionalAreas, setVisibleOptionalAreas] = useState<TechnicianArea[]>([]);
  const [areaFilter, setAreaFilter] = useState<TechnicianArea | "all">(area);
  const [searchTerm, setSearchTerm] = useState("");

  const normalizedOptionalAreas = useMemo(
    () => optionalAreas.filter((optionalArea) => optionalArea !== area),
    [area, optionalAreas],
  );

  const hiddenOptionalAreas = normalizedOptionalAreas.filter(
    (optionalArea) => !visibleOptionalAreas.includes(optionalArea),
  );

  const availableAreas = useMemo(
    () => Array.from(new Set([area, ...normalizedOptionalAreas])),
    [area, normalizedOptionalAreas],
  );

  const visibleAreas = useMemo(() => {
    if (variant === "compact") {
      return areaFilter === "all" ? availableAreas : [areaFilter];
    }

    return [area, ...visibleOptionalAreas];
  }, [area, areaFilter, availableAreas, variant, visibleOptionalAreas]);

  useEffect(() => {
    setAreaFilter(area);
    setVisibleOptionalAreas([]);
    setSearchTerm("");
    setShowAll(false);
  }, [area]);

  const { list, hasShiftFallback } = useMemo(() => {
    const excluded = new Set(excludeNames);

    const allActive = uniqueByName(
      visibleAreas.flatMap((currentArea) => getActiveTechniciansForArea(currentArea)),
    ).filter((technician) => !excluded.has(technician.name));

    const config = getTechnicianShiftFilterConfig();

    if (!config.filterByCurrentShift || showAll)
      return { list: allActive, hasShiftFallback: false };

    const currentShift = getCurrentShiftFromConfig();
    if (!currentShift) return { list: allActive, hasShiftFallback: false };

    const inShift = allActive.filter((technician) => technician.shiftId === currentShift.id);
    if (inShift.length > 0) return { list: inShift, hasShiftFallback: false };

    return { list: allActive, hasShiftFallback: true };
  }, [visibleAreas, showAll, excludeNames]);

  const filteredList = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("pt-BR");

    if (!normalizedSearch) return list;

    return list.filter((technician) =>
      technician.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
    );
  }, [list, searchTerm]);

  function toggleTechnician(name: string) {
    onChange((current) =>
      current.includes(name) ? current.filter((selected) => selected !== name) : [...current, name],
    );
  }

  function showOptionalArea(optionalArea: TechnicianArea) {
    setVisibleOptionalAreas((current) =>
      current.includes(optionalArea) ? current : [...current, optionalArea],
    );
  }

  function getShiftName(shiftId: string): string {
    const shift = getShiftConfigs().find((item) => item.id === shiftId);
    return shift?.name ?? (variant === "compact" ? "Turno não informado" : "Não informado");
  }

  if (variant === "compact") {
    const shiftFilterEnabled = getTechnicianShiftFilterConfig().filterByCurrentShift;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/30 p-1">
            {availableAreas.map((availableArea) => (
              <button
                key={availableArea}
                type="button"
                aria-pressed={areaFilter === availableArea}
                onClick={() => {
                  setAreaFilter(availableArea);
                  setSearchTerm("");
                }}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-xs font-bold transition-colors",
                  areaFilter === availableArea
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {AREA_FILTER_LABELS[availableArea]}
              </button>
            ))}

            {availableAreas.length > 1 && (
              <button
                type="button"
                aria-pressed={areaFilter === "all"}
                onClick={() => {
                  setAreaFilter("all");
                  setSearchTerm("");
                }}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-xs font-bold transition-colors",
                  areaFilter === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                Todos
              </button>
            )}
          </div>

          {shiftFilterEnabled && !hasShiftFallback && (
            <button
              type="button"
              aria-pressed={showAll}
              className="min-h-11 rounded-lg border border-border px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Somente turno atual" : "Todos os turnos"}
            </button>
          )}
        </div>

        {hasShiftFallback && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Nenhum manutentor ativo no turno atual. Exibindo todos os ativos.
          </p>
        )}

        {list.length > 8 && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              aria-label="Buscar mantenedor"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar mantenedor"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
            />
          </label>
        )}

        {filteredList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {searchTerm
              ? "Nenhum mantenedor encontrado para esta busca."
              : "Nenhum mantenedor cadastrado para esta seleção."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredList.map((technician) => {
              const selected = value.includes(technician.name);

              return (
                <button
                  key={technician.id || technician.name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTechnician(technician.name)}
                  className={cn(
                    "relative min-h-[72px] rounded-xl border-2 p-3 text-left transition-all",
                    selected
                      ? "border-success bg-success/10 text-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent",
                  )}
                >
                  {selected && (
                    <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}

                  <div className="truncate pr-6 text-base font-black">{technician.name}</div>
                  <div className="mt-1 text-xs font-semibold text-muted-foreground">
                    {AREA_ROLE_LABELS[technician.area] ?? technician.area}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {getShiftName(technician.shiftId)}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {value.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">Selecionados:</span> {value.join(", ")}
          </p>
        )}
      </div>
    );
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
          <button
            type="button"
            className="text-xs font-semibold text-primary underline"
            onClick={() => setShowAll(true)}
          >
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
        <p className="text-sm text-muted-foreground">
          Nenhum manutentor cadastrado para esta seleção.
        </p>
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
                <div className="text-xs opacity-80">
                  {AREA_LABELS[technician.area] ?? technician.area}
                </div>
                <div className="text-xs opacity-80">{getShiftName(technician.shiftId)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
