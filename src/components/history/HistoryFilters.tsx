import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AndonCall, CallCategory, CallSubtype } from "@/types/andon";

export type HistoryFilter =
  | { kind: "all" }
  | { kind: "category"; value: CallCategory }
  | { kind: "subtype"; value: CallSubtype }
  | { kind: "machine"; value: string };

const PRESET_BUTTONS: { label: string; filter: HistoryFilter }[] = [
  { label: "Todos", filter: { kind: "all" } },
  { label: "Manutenção", filter: { kind: "category", value: "maintenance" } },
  { label: "Produção", filter: { kind: "category", value: "production" } },
  { label: "Elétrica", filter: { kind: "subtype", value: "electrical" } },
  { label: "Mecânica", filter: { kind: "subtype", value: "mechanical" } },
  { label: "Hot Melt", filter: { kind: "subtype", value: "hot_melt" } },
  { label: "Qualidade", filter: { kind: "subtype", value: "quality" } },
  { label: "Liderança", filter: { kind: "subtype", value: "leadership" } },
];

interface HistoryFiltersProps {
  filter: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
  availableMachines: string[];
}

export function HistoryFilters({ filter, onChange, availableMachines }: HistoryFiltersProps) {
  const isActive = (f: HistoryFilter) =>
    f.kind === filter.kind &&
    (f.kind === "all" ||
      (f.kind === filter.kind && (f as { value: string }).value === (filter as { value: string }).value));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESET_BUTTONS.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={() => onChange(b.filter)}
          className={cn(
            "min-h-[48px] rounded-xl border-2 px-4 text-sm font-bold uppercase tracking-wider transition-all",
            isActive(b.filter)
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-accent",
          )}
        >
          {b.label}
        </button>
      ))}
      <select
        value={filter.kind === "machine" ? filter.value : ""}
        onChange={(e) =>
          onChange(
            e.target.value ? { kind: "machine", value: e.target.value } : { kind: "all" },
          )
        }
        className="min-h-[48px] rounded-xl border-2 border-border bg-card px-4 text-sm font-bold uppercase tracking-wider text-foreground"
      >
        <option value="">Máquina (todas)</option>
        {availableMachines.map((m) => (
          <option key={m} value={m}>
            Máquina {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export function applyHistoryFilter(
  calls: AndonCall[],
  filter: HistoryFilter,
): AndonCall[] {
  switch (filter.kind) {
    case "all":
      return calls;
    case "category":
      return calls.filter((c) => c.category === filter.value);
    case "subtype":
      return calls.filter((c) => c.subtype === filter.value);
    case "machine":
      return calls.filter((c) => c.machineId === filter.value);
  }
}

export function useHistoryFilterState() {
  const [filter, setFilter] = useState<HistoryFilter>({ kind: "all" });
  const memoFilter = useMemo(() => filter, [filter]);
  return { filter: memoFilter, setFilter };
}
