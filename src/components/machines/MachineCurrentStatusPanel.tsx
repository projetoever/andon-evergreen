import type { Machine } from "@/types/machine";
import { useTicker } from "@/hooks/useTicker";
import { cn } from "@/lib/utils";
import {
  calculateMachineStoppedMinutes,
  getActiveMachineStoppedAt,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { getMachineStatusLabel, getProductionModeLabel } from "@/utils/statusUtils";

interface MachineCurrentStatusPanelProps {
  machine: Machine;
  className?: string;
  compactNormal?: boolean;
}

export function MachineCurrentStatusPanel({ machine, className, compactNormal = false }: MachineCurrentStatusPanelProps) {
  useTicker(1000);
  const stoppedMin = calculateMachineStoppedMinutes(machine);
  const activeStoppedAt = getActiveMachineStoppedAt(machine);
  const isStopped = machine.machineStatus === "stopped";
  const isNotScheduled = machine.productionMode === "not_scheduled";

  return (
    <div
      className={cn(
        compactNormal
          ? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-md"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-md",
        isStopped && !isNotScheduled ? "border-danger/60" : "border-border",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            Status atual da máquina
          </h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {getProductionModeLabel(machine.productionMode)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider",
            isStopped ? "bg-danger text-danger-foreground" : "bg-success text-success-foreground",
          )}
        >
          {getMachineStatusLabel(machine.machineStatus)}
        </span>
      </div>

      <dl className={cn(
        "grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2",
        compactNormal ? "xl:grid-cols-3 xl:content-start" : "xl:grid-cols-3",
      )}>
        <div
          className={cn(
            compactNormal ? "rounded-lg border p-2.5" : "rounded-lg border p-2.5 sm:col-span-2 xl:col-span-1",
            isStopped ? "border-danger/30 bg-danger/10" : "border-success/30 bg-success/10",
          )}
        >
          <dt className="text-xs uppercase text-muted-foreground">Condição operacional</dt>
          <dd className={cn(compactNormal ? "mt-1 text-lg font-black" : "mt-1 text-xl font-black", isStopped ? "text-danger" : "text-success")}>
            {isStopped ? "Máquina em falha" : "Pronta para rodar"}
          </dd>
          <p className={cn("mt-1 text-xs text-muted-foreground", compactNormal && "hidden 2xl:block")}>
            {isStopped
              ? "Tempo contado desde a parada real da máquina. Pode ser maior que o tempo do ANDON se a falha começou antes do chamado."
              : "Sem falha ativa registrada para esta máquina."}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-2.5">
          <dt className="text-xs uppercase text-muted-foreground">Última alteração de status</dt>
          <dd className="mt-1 font-mono text-sm text-foreground md:text-base">
            {formatDateTime(machine.lastStatusChangedAt)}
          </dd>
        </div>

        {isStopped && activeStoppedAt && (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5">
              <dt className="text-xs uppercase text-muted-foreground">Falha iniciada em</dt>
              <dd className="mt-1 font-mono text-sm text-foreground md:text-base">
                {formatDateTime(activeStoppedAt)}
              </dd>
            </div>
            <div className="rounded-lg border border-danger/40 bg-danger/15 p-2.5 sm:col-span-2 xl:col-span-3">
              <dt className="text-xs uppercase text-muted-foreground">Tempo total em falha</dt>
              <dd className="mt-1 text-3xl font-black leading-none text-danger md:text-4xl">
                {formatDurationMinutes(stoppedMin)}
              </dd>
            </div>
          </>
        )}

        {!isStopped && (
          <div className={cn("rounded-lg border border-border bg-muted/20 p-2.5", compactNormal ? "" : "sm:col-span-2 xl:col-span-1")}>
            <dt className="text-xs uppercase text-muted-foreground">Última falha</dt>
            <dd className={cn("mt-1 font-bold text-foreground", compactNormal ? "text-lg" : "text-xl")}>
              {machine.lastStopDurationMinutes > 0
                ? formatDurationMinutes(machine.lastStopDurationMinutes)
                : "Sem registro"}
            </dd>
            {!compactNormal && <p className="mt-1 text-xs text-muted-foreground">Informação secundária para acompanhamento.</p>}
          </div>
        )}
      </dl>
    </div>
  );
}
