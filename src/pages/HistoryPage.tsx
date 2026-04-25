import { useMemo } from "react";
import { useAndon } from "@/context/AndonProvider";
import {
  HistoryFilters,
  applyHistoryFilter,
  useHistoryFilterState,
} from "@/components/history/HistoryFilters";
import { HistoryTable } from "@/components/history/HistoryTable";
import { BigButton } from "@/components/common/BigButton";
import { exportHistoryToCsv } from "@/services/exportService";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export function HistoryPage() {
  const { calls, machines } = useAndon();
  const { filter, setFilter } = useHistoryFilterState();

  const finished = useMemo(
    () =>
      calls
        .filter((c) => c.status === "finished")
        .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? "")),
    [calls],
  );

  const filtered = useMemo(() => applyHistoryFilter(finished, filter), [finished, filter]);

  function handleExport() {
    if (filtered.length === 0) {
      toast.warning("Nada para exportar");
      return;
    }
    exportHistoryToCsv(filtered);
    toast.success("CSV exportado");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold uppercase tracking-wider text-foreground">
          Histórico
        </h2>
        <BigButton tone="success" size="md" onClick={handleExport}>
          <FileSpreadsheet className="h-5 w-5" /> Exportar CSV
        </BigButton>
      </div>
      <HistoryFilters
        filter={filter}
        onChange={setFilter}
        availableMachines={machines.map((m) => m.id)}
      />
      <HistoryTable calls={filtered} />
    </div>
  );
}
