import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MachineSet } from "@/types/machineSet";

interface MachineAssetSelectorProps {
  machineSets: MachineSet[];
  selectedMachineSetId: string | null;
  selectedMachineSubsetId: string | null;
  isWholeSetSelected: boolean;
  allowWholeSetCalls: boolean;
  onSelectMachineSet: (machineSetId: string) => void;
  onSelectMachineSubset: (machineSubsetId: string) => void;
  onSelectWholeSet: () => void;
}

const SEARCH_THRESHOLD = 8;

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function MachineAssetSelector({
  machineSets,
  selectedMachineSetId,
  selectedMachineSubsetId,
  isWholeSetSelected,
  allowWholeSetCalls,
  onSelectMachineSet,
  onSelectMachineSubset,
  onSelectWholeSet,
}: MachineAssetSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const selectedMachineSet = useMemo(
    () => machineSets.find((set) => set.id === selectedMachineSetId) ?? null,
    [machineSets, selectedMachineSetId],
  );

  const activeSubsets = useMemo(
    () =>
      (selectedMachineSet?.subsets ?? []).filter(
        (subset) => subset.isActive && subset.subsetType?.isActive !== false,
      ),
    [selectedMachineSet],
  );

  const filteredSubsets = useMemo(() => {
    const query = normalizeSearchValue(searchQuery.trim());

    if (!query) {
      return activeSubsets;
    }

    return activeSubsets.filter((subset) =>
      [
        subset.name,
        subset.code,
        subset.subsetType?.name,
        subset.manufacturer,
        subset.model,
        subset.assetTag,
      ].some((value) => normalizeSearchValue(value).includes(query)),
    );
  }, [activeSubsets, searchQuery]);

  const selectedMachineSubset = activeSubsets.find(
    (subset) => subset.id === selectedMachineSubsetId,
  );

  useEffect(() => {
    setSearchQuery("");
  }, [selectedMachineSetId]);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Conjunto da máquina
        </h4>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {machineSets.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => onSelectMachineSet(set.id)}
              className={cn(
                "min-h-12 rounded-lg border-2 px-3 py-2 text-left transition-all hover:scale-[1.01]",
                selectedMachineSetId === set.id
                  ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-ring/30"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              <div className="truncate text-sm font-black uppercase tracking-wide">{set.name}</div>
              <div className="truncate text-[11px] opacity-80">
                {set.code}
                {set.setType?.name ? ` • ${set.setType.name}` : set.type ? ` • ${set.type}` : ""}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedMachineSet && (
        <div className="rounded-xl border border-border bg-muted/15 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Equipamento ou subconjunto
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeSubsets.length === 0
                  ? "Nenhum equipamento ativo cadastrado neste conjunto."
                  : allowWholeSetCalls
                    ? "Escolha o equipamento ou selecione explicitamente o conjunto inteiro."
                    : "Escolha o equipamento exato relacionado ao chamado."}
              </p>
            </div>

            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
              {activeSubsets.length} cadastrado{activeSubsets.length === 1 ? "" : "s"}
            </span>
          </div>

          {activeSubsets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              O chamado será aberto automaticamente para o conjunto inteiro.
            </div>
          ) : (
            <>
              {activeSubsets.length > SEARCH_THRESHOLD && (
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar por nome, código, TAG, fabricante ou modelo"
                    className="h-10 pl-9"
                  />
                </div>
              )}

              <div className="max-h-64 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {allowWholeSetCalls && !searchQuery.trim() && (
                    <button
                      type="button"
                      onClick={onSelectWholeSet}
                      className={cn(
                        "min-h-14 rounded-lg border-2 px-3 py-2 text-left transition-all hover:scale-[1.01]",
                        isWholeSetSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-ring/30"
                          : "border-dashed border-border bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      <div className="text-sm font-black uppercase tracking-wide">
                        Conjunto inteiro
                      </div>
                      <div className="text-[11px] opacity-80">Sem equipamento específico</div>
                    </button>
                  )}

                  {filteredSubsets.map((subset) => (
                    <button
                      key={subset.id}
                      type="button"
                      onClick={() => onSelectMachineSubset(subset.id)}
                      className={cn(
                        "min-h-14 rounded-lg border-2 px-3 py-2 text-left transition-all hover:scale-[1.01]",
                        selectedMachineSubsetId === subset.id
                          ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-ring/30"
                          : "border-border bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      <div className="truncate text-sm font-black uppercase tracking-wide">
                        {subset.name}
                      </div>
                      <div className="truncate text-[11px] opacity-80">
                        {[subset.code, subset.assetTag, subset.manufacturer, subset.model]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    </button>
                  ))}
                </div>

                {filteredSubsets.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border bg-background p-3 text-center text-sm text-muted-foreground">
                    Nenhum equipamento corresponde à busca.
                  </div>
                )}
              </div>
            </>
          )}

          <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Localização selecionada
            </span>
            <div className="mt-0.5 font-black text-foreground">
              {selectedMachineSet.name}
              {activeSubsets.length === 0 || isWholeSetSelected
                ? " → Conjunto inteiro"
                : selectedMachineSubset
                  ? ` → ${selectedMachineSubset.name}`
                  : " → Selecione um equipamento"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
