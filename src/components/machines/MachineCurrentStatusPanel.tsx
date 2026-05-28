import type { Machine } from "@/types/machine";
import { useTicker } from "@/hooks/useTicker";
import {
  calculateMachineStoppedMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";

interface MachineCurrentStatusPanelProps {
  machine: Machine;
}

export function MachineCurrentStatusPanel({ machine }: MachineCurrentStatusPanelProps) {
  useTicker(1000);
  const stoppedMin = calculateMachineStoppedMinutes(machine);
  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
        Status atual da máquina
      </h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <dt className="text-xs uppercase text-muted-foreground">Última alteração de status</dt>
          <dd className="mt-1 font-mono text-base text-foreground md:text-lg">
            {formatDateTime(machine.lastStatusChangedAt)}
          </dd>
        </div>
        {machine.machineStatus === "stopped" && machine.stoppedAt && (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <dt className="text-xs uppercase text-muted-foreground">Em falha desde</dt>
              <dd className="mt-1 font-mono text-base text-foreground md:text-lg">
                {formatDateTime(machine.stoppedAt)}
              </dd>
            </div>
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3">
              <dt className="text-xs uppercase text-muted-foreground">Tempo em falha</dt>
              <dd className="mt-1 text-3xl font-black text-danger">
                {formatDurationMinutes(stoppedMin)}
              </dd>
            </div>
          </>
        )}
        {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <dt className="text-xs uppercase text-muted-foreground">Última falha</dt>
            <dd className="mt-1 text-2xl font-bold text-foreground">
              {formatDurationMinutes(machine.lastStopDurationMinutes)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
