import { ui } from "@/i18n/translate";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { GlobalCallHistoryPage } from "./GlobalCallHistoryPage";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
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
import { toast } from "@/i18n/toast";

/** Keep the existing legacy history path intact when central mode is OFF.
 * A central Hub session opens the new scoped global experience only, without
 * mounting the legacy all-calls AndonProvider in this route.
 */
export function HistoryPage() {
  const { access, checking } = useModuleAccess();
  if (checking) return <main role="status" className="p-6">{ui("Verificando histórico…")}</main>;
  if (access?.centralAccessEnabled) return <GlobalCallHistoryPage />;
  return <LegacyHistoryPage />;
}

function LegacyHistoryPage() {
  useInterfaceLanguage();
  const { calls, machines } = useAndon();
  const { filter, setFilter } = useHistoryFilterState();

  const finished = useMemo(
    () =>
      calls
        .filter((c) => c.status === "finished" || (c.isSystemTest && c.finishedAt !== null))
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
          {ui("Histórico")}
        </h2>
        <BigButton tone="success" size="md" onClick={handleExport}>
          <FileSpreadsheet className="h-5 w-5" />
          {ui(" Exportar CSV")}
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
