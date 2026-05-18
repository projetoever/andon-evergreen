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
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Última mudança</dt>
          <dd className="font-mono text-base text-foreground">
            {formatDateTime(machine.lastStatusChangedAt)}
          </dd>
        </div>
        {machine.machineStatus === "stopped" && machine.stoppedAt && (
          <>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Em falha desde</dt>
              <dd className="font-mono text-base text-foreground">
                {formatDateTime(machine.stoppedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Tempo em falha</dt>
              <dd className="text-2xl font-bold text-danger">
                {formatDurationMinutes(stoppedMin)}
              </dd>
            </div>
          </>
        )}
        {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Última falha</dt>
            <dd className="text-2xl font-bold text-foreground">
              {formatDurationMinutes(machine.lastStopDurationMinutes)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
