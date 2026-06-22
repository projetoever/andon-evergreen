import type { AndonCall } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";
import { cn } from "@/lib/utils";
import { useTicker } from "@/hooks/useTicker";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculatePostMaintenanceMinutes,
  calculateTotalCallMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  getAndonStatusLabel,
  getCallSubtypeLabel,
  getCriticalityColorClass,
  getCriticalityLabel,
  getMachineConditionLabel,
} from "@/utils/statusUtils";
import { EmptyState } from "@/components/common/EmptyState";
import { Inbox } from "lucide-react";

interface MachineCurrentCallPanelProps {
  call: AndonCall | null;
  className?: string;
  compactEmpty?: boolean;
  currentMachineStatus?: MachineStatus;
}

export function MachineCurrentCallPanel({
  call,
  className,
  compactEmpty = false,
  currentMachineStatus,
}: MachineCurrentCallPanelProps) {
  useTicker(1000);
  if (!call) {
    if (compactEmpty) {
      return (
        <div
          className={cn(
            "flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-6 py-5 text-center shadow-md",
            className,
          )}
        >
          <div className="text-muted-foreground"><Inbox className="h-9 w-9" /></div>
          <h3 className="text-lg font-semibold text-foreground">Sem chamado ativo</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Use o botão ABRIR ANDON para registrar um novo chamado para esta máquina.
          </p>
        </div>
      );
    }

    return (
      <EmptyState
        icon={<Inbox className="h-12 w-12" />}
        title="Sem chamado ativo"
        description="Use o botão ABRIR ANDON para registrar um novo chamado para esta máquina."
        className={cn("h-full min-h-0 border-solid bg-card px-6 py-8 shadow-md", className)}
      />
    );
  }
  const waiting = calculateCallWaitingMinutes(call);
  const attending = calculateAttendanceMinutes(call);
  const postMaintenance =
    call.status === "finished" ? call.postMaintenanceMinutes : calculatePostMaintenanceMinutes(call);
  const total = calculateTotalCallMinutes(call);
  const displayedMachineCondition = currentMachineStatus ?? call.machineCondition;
  const showOpeningCondition = Boolean(currentMachineStatus && currentMachineStatus !== call.machineCondition);
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-3 shadow-md",
        className,
      )}
    >
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
        Chamado atual
      </h3>
      <dl className="grid min-h-0 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-sm lg:grid-cols-3">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Categoria</dt>
          <dd className="text-base font-bold leading-tight text-foreground md:text-lg">
            {call.category === "maintenance" ? "Manutenção" : "Produção"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Subtipo</dt>
          <dd className="text-base font-bold leading-tight text-foreground md:text-lg">
            {getCallSubtypeLabel(call.subtype)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Status</dt>
          <dd className="text-base font-bold leading-tight text-foreground md:text-lg">
            {getAndonStatusLabel(call.status)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Criticidade</dt>
          <dd
            className={
              "inline-flex rounded-md border px-2 py-0.5 text-sm font-bold " +
              getCriticalityColorClass(call.criticality)
            }
          >
            Criticidade: {getCriticalityLabel(call.criticality)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Aberto em</dt>
          <dd className="font-mono text-sm leading-tight text-foreground">{formatDateTime(call.openedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Atendido em</dt>
          <dd className="font-mono text-sm leading-tight text-foreground">{formatDateTime(call.attendedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Conclusão da manutenção</dt>
          <dd className="font-mono text-sm leading-tight text-foreground">{formatDateTime(call.maintenanceCompletedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Finalizado em</dt>
          <dd className="font-mono text-sm leading-tight text-foreground">{formatDateTime(call.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Condição atual da máquina</dt>
          <dd className="text-base font-bold leading-tight text-foreground md:text-lg">
            {getMachineConditionLabel(displayedMachineCondition)}
          </dd>
        </div>
        {showOpeningCondition && (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Condição ao abrir</dt>
            <dd className="text-base font-bold leading-tight text-muted-foreground md:text-lg">
              {getMachineConditionLabel(call.machineCondition)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Aguardando</dt>
          <dd className="text-xl font-bold leading-tight text-warning md:text-2xl">{formatDurationMinutes(waiting)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Em atendimento</dt>
          <dd className="text-xl font-bold leading-tight text-info md:text-2xl">{formatDurationMinutes(attending)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Acompanhamento</dt>
          <dd className="text-xl font-bold leading-tight text-info md:text-2xl">{formatDurationMinutes(postMaintenance)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Total</dt>
          <dd className="text-xl font-bold leading-tight text-foreground md:text-2xl">{formatDurationMinutes(total)}</dd>
        </div>
        {(call.technicianNames.length > 0 || call.technicianName) && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Técnico</dt>
            <dd className="text-base font-bold leading-tight text-foreground md:text-lg">
              {call.technicianNames.length > 0 ? call.technicianNames.join(", ") : call.technicianName}
            </dd>
          </div>
        )}
        {call.notes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Descrição</dt>
            <dd className="text-sm text-foreground">{call.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
