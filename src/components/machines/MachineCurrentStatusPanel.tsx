import type { Machine } from "@/types/machine";
import { useTicker } from "@/hooks/useTicker";
import { cn } from "@/lib/utils";
import {
  calculateMachineStoppedMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { getMachineStatusLabel, getProductionModeLabel } from "@/utils/statusUtils";

interface MachineCurrentStatusPanelProps {
  machine: Machine;
  className?: string;
}

export function MachineCurrentStatusPanel({ machine, className }: MachineCurrentStatusPanelProps) {
  useTicker(1000);
  const stoppedMin = calculateMachineStoppedMinutes(machine);
  const isStopped = machine.machineStatus === "stopped";
  const isNotScheduled = machine.productionMode === "not_scheduled";

  return (
    <div
      className={cn(
        "flex h-full min-h-[260px] flex-col rounded-xl border bg-card p-4 shadow-md md:p-5",
        isStopped && !isNotScheduled ? "border-danger/60" : "border-border",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
            Status atual da máquina
          </h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {getProductionModeLabel(machine.productionMode)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider",
            isStopped ? "bg-danger text-danger-foreground" : "bg-success text-success-foreground",
          )}
        >
          {getMachineStatusLabel(machine.machineStatus)}
        </span>
      </div>

      <dl className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div
          className={cn(
            "rounded-lg border p-3 sm:col-span-2 xl:col-span-1",
            isStopped ? "border-danger/30 bg-danger/10" : "border-success/30 bg-success/10",
          )}
        >
          <dt className="text-xs uppercase text-muted-foreground">Condição operacional</dt>
          <dd className={cn("mt-2 text-2xl font-black", isStopped ? "text-danger" : "text-success")}>
            {isStopped ? "Máquina em falha" : "Pronta para rodar"}
          </dd>
          <p className="mt-2 text-sm text-muted-foreground">
            {isStopped
              ? "Acompanhe o tempo parado e acione a tratativa pelo painel de ações."
              : "Sem falha ativa registrada para esta máquina."}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <dt className="text-xs uppercase text-muted-foreground">Última alteração de status</dt>
          <dd className="mt-2 font-mono text-base text-foreground md:text-lg">
            {formatDateTime(machine.lastStatusChangedAt)}
          </dd>
        </div>

        {isStopped && machine.stoppedAt && (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <dt className="text-xs uppercase text-muted-foreground">Em falha desde</dt>
              <dd className="mt-2 font-mono text-base text-foreground md:text-lg">
                {formatDateTime(machine.stoppedAt)}
              </dd>
            </div>
            <div className="rounded-lg border border-danger/40 bg-danger/15 p-3 sm:col-span-2 xl:col-span-3">
              <dt className="text-xs uppercase text-muted-foreground">Tempo em falha</dt>
              <dd className="mt-2 text-4xl font-black leading-none text-danger md:text-5xl">
                {formatDurationMinutes(stoppedMin)}
              </dd>
            </div>
          </>
        )}

        {!isStopped && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 sm:col-span-2 xl:col-span-1">
            <dt className="text-xs uppercase text-muted-foreground">Última falha</dt>
            <dd className="mt-2 text-2xl font-bold text-foreground">
              {machine.lastStopDurationMinutes > 0
                ? formatDurationMinutes(machine.lastStopDurationMinutes)
                : "Sem registro"}
            </dd>
            <p className="mt-2 text-sm text-muted-foreground">Informação secundária para acompanhamento.</p>
          </div>
        )}
      </dl>
    </div>
  );
}
