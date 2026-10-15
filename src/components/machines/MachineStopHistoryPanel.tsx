import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import type { Machine } from "@/types/machine";
import { StopHistoryList } from "./StopHistoryList";

interface MachineStopHistoryPanelProps {
  machine: Machine;
}

export function MachineStopHistoryPanel({ machine }: MachineStopHistoryPanelProps) {
  useInterfaceLanguage();
  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
        {ui("Histórico de falhas")}
      </h3>
      <StopHistoryList stopHistory={machine.stopHistory} />
    </div>
  );
}
