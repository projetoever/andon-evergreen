import type { AndonCall } from "@/types/andon";
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
}

export function MachineCurrentCallPanel({ call }: MachineCurrentCallPanelProps) {
  useTicker(1000);
  if (!call) {
    return (
      <EmptyState
        icon={<Inbox className="h-10 w-10" />}
        title="Sem chamado ativo"
        description="Use o botão ABRIR ANDON para registrar um novo chamado para esta máquina."
      />
    );
  }
  const waiting = calculateCallWaitingMinutes(call);
  const attending = calculateAttendanceMinutes(call);
  const postMaintenance = call.status === "finished"
    ? call.postMaintenanceMinutes
    : calculatePostMaintenanceMinutes(call);
  const total = calculateTotalCallMinutes(call);
  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h3 className="mb-3 text-base font-bold uppercase tracking-wider text-foreground md:text-lg">
        Chamado atual
      </h3>
      <dl className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Categoria</dt>
          <dd className="text-base font-bold text-foreground">
            {call.category === "maintenance" ? "Manutenção" : "Produção"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Subtipo</dt>
          <dd className="text-base font-bold text-foreground">
            {getCallSubtypeLabel(call.subtype)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Status</dt>
          <dd className="text-base font-bold text-foreground">
            {getAndonStatusLabel(call.status)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Criticidade</dt>
          <dd className={"inline-flex rounded-md border px-2 py-1 text-sm font-bold md:text-base " + getCriticalityColorClass(call.criticality)}>
            Criticidade: {getCriticalityLabel(call.criticality)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Aberto em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.openedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Atendido em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.attendedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Conclusão da manutenção</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.maintenanceCompletedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Finalizado em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Condição da máquina</dt>
          <dd className="text-base font-bold text-foreground">
            {getMachineConditionLabel(call.machineCondition)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Aguardando</dt>
          <dd className="text-xl font-bold text-warning md:text-2xl">{formatDurationMinutes(waiting)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Em atendimento</dt>
          <dd className="text-xl font-bold text-info md:text-2xl">{formatDurationMinutes(attending)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Acompanhamento</dt>
          <dd className="text-xl font-bold text-info md:text-2xl">{formatDurationMinutes(postMaintenance)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Total</dt>
          <dd className="text-xl font-bold text-foreground md:text-2xl">{formatDurationMinutes(total)}</dd>
        </div>
        {(call.technicianNames.length > 0 || call.technicianName) && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Técnico</dt>
            <dd className="text-base font-bold text-foreground">
              {call.technicianNames.length > 0 ? call.technicianNames.join(", ") : call.technicianName}
            </dd>
          </div>
        )}
        {call.notes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Descrição</dt>
            <dd className="text-base text-foreground">{call.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
