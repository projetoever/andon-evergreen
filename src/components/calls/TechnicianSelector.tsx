import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Search } from "lucide-react";
import { useTechnicians } from "@/hooks/useTechnicians";
import {
  getCurrentShiftFromConfig,
  getTechnicianShiftFilterConfig,
} from "@/services/technicianShiftFilterService";
import type { TechnicianArea } from "@/types/andon";
import type { TechnicianConfig } from "@/types/settings";
import { getShiftConfigs } from "@/services/shiftConfigService";
import { cn } from "@/lib/utils";
import { getServerClockRevision, subscribeServerClock } from "@/utils/serverClock";
import type { TechnicianActiveAssignment } from "@/utils/technicianAvailabilityUtils";

interface TechnicianSelectorProps {
  area: TechnicianArea;
  value: string[];
  onChange: Dispatch<SetStateAction<string[]>>;
  excludeNames?: string[];
  optionalAreas?: TechnicianArea[];
  variant?: "default" | "compact";
  activeAssignments?: ReadonlyMap<string, TechnicianActiveAssignment>;
}

const AREA_LABELS: Partial<Record<TechnicianArea, string>> = {
  electrical: "eletricistas",
  mechanical: "mecânicos",
  hot_melt: "hot melt",
};

const AREA_FILTER_LABELS: Partial<Record<TechnicianArea, string>> = {
  electrical: "Elétrica",
  mechanical: "Mecânica",
  hot_melt: "Hot Melt",
};

const AREA_ROLE_LABELS: Partial<Record<TechnicianArea, string>> = {
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

function technicianAreas(technician: TechnicianConfig) {
  return technician.areas?.length ? technician.areas : [technician.area];
}

function normalizeTechnicianName(name: string) {
  return name.trim().toLocaleLowerCase("pt-BR");
}

function activeAssignmentFor(
  technician: TechnicianConfig,
  assignments: ReadonlyMap<string, TechnicianActiveAssignment>,
) {
  return (
    assignments.get(`id:${technician.id}`) ??
    assignments.get(`name:${normalizeTechnicianName(technician.name)}`) ??
    null
  );
}

export function TechnicianSelector({
  area,
  value,
  onChange,
  excludeNames = [],
  optionalAreas = [],
  variant = "default",
  activeAssignments = new Map(),
}: TechnicianSelectorProps) {
  const { technicians, isLoading, error, refreshTechnicians } = useTechnicians();
  const [showAll, setShowAll] = useState(false);
  const [visibleOptionalAreas, setVisibleOptionalAreas] = useState<TechnicianArea[]>([]);
  const [areaFilter, setAreaFilter] = useState<TechnicianArea | "all">(area);
  const [searchTerm, setSearchTerm] = useState("");
  const [serverClockRevision, setServerClockRevision] = useState(getServerClockRevision);

  useEffect(() => subscribeServerClock(() => setServerClockRevision(getServerClockRevision())), []);

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
    void serverClockRevision;
    const excluded = new Set(excludeNames);

    const allActive = uniqueByName(
      visibleAreas.flatMap((currentArea) =>
        technicians.filter(
          (technician) => technician.active && technicianAreas(technician).includes(currentArea),
        ),
      ),
    ).filter((technician) => !excluded.has(technician.name));

    const config = getTechnicianShiftFilterConfig();

    if (!config.filterByCurrentShift || showAll)
      return { list: allActive, hasShiftFallback: false };

    const currentShift = getCurrentShiftFromConfig();
    if (!currentShift) return { list: allActive, hasShiftFallback: false };

    const inShift = allActive.filter((technician) => technician.shiftId === currentShift.id);
    if (inShift.length > 0) return { list: inShift, hasShiftFallback: false };

    return { list: allActive, hasShiftFallback: true };
  }, [visibleAreas, showAll, excludeNames, technicians, serverClockRevision]);

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
                {AREA_FILTER_LABELS[availableArea] ?? availableArea}
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
            Nenhum mantenedor ativo no turno atual. Exibindo todos os ativos.
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

        {error ? (
          <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <p>{error}</p>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => void refreshTechnicians()}
            >
              Tentar novamente
            </button>
          </div>
        ) : isLoading ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Carregando mantenedores...
          </p>
        ) : filteredList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {searchTerm
              ? "Nenhum mantenedor encontrado para esta busca."
              : "Nenhum mantenedor cadastrado para esta seleção."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {filteredList.map((technician) => {
              const selected = value.includes(technician.name);
              const activeAssignment = activeAssignmentFor(technician, activeAssignments);
              const unavailable = Boolean(activeAssignment);

              return (
                <button
                  key={technician.id || technician.name}
                  type="button"
                  aria-pressed={selected}
                  aria-disabled={unavailable}
                  disabled={unavailable}
                  onClick={() => toggleTechnician(technician.name)}
                  className={cn(
                    "relative min-h-[72px] rounded-xl border-2 p-3 text-left transition-all",
                    unavailable
                      ? "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground opacity-60"
                      : selected
                        ? "border-success bg-success/10 text-foreground shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent",
                  )}
                >
                  {selected && !unavailable && (
                    <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}

                  <div className="truncate pr-6 text-base font-black">{technician.name}</div>
                  <div className="mt-1 text-xs font-semibold text-muted-foreground">
                    {technicianAreas(technician)
                      .map((technicianArea) => AREA_ROLE_LABELS[technicianArea] ?? technicianArea)
                      .join(", ")}
                  </div>
                  {activeAssignment ? (
                    <div className="mt-1 truncate text-[11px] font-bold text-warning">
                      Ativo · {activeAssignment.machineLabel}
                    </div>
                  ) : (
                    <div className="truncate text-xs text-muted-foreground">
                      {getShiftName(technician.shiftId)}
                    </div>
                  )}
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
            Nenhum mantenedor ativo no turno atual. Exibindo todos os ativos.
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
            Mostrar {AREA_LABELS[optionalArea] ?? optionalArea}
          </button>
        ))}
      </div>

      {error ? (
        <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            className="font-bold underline"
            onClick={() => void refreshTechnicians()}
          >
            Tentar novamente
          </button>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando mantenedores...</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum mantenedor cadastrado para esta seleção.
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
                  {technicianAreas(technician)
                    .map((technicianArea) => AREA_LABELS[technicianArea] ?? technicianArea)
                    .join(", ")}
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
