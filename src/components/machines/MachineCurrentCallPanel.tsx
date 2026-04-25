import type { AndonCall } from "@/types/andon";
import { useTicker } from "@/hooks/useTicker";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculateTotalCallMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { getAndonStatusLabel, getCallSubtypeLabel } from "@/utils/statusUtils";
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
  const total = calculateTotalCallMinutes(call);
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="mb-4 text-lg font-bold uppercase tracking-wider text-foreground">
        Chamado atual
      </h3>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <dt className="text-xs uppercase text-muted-foreground">Aberto em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.openedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Atendido em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.attendedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Finalizado em</dt>
          <dd className="font-mono text-sm text-foreground">{formatDateTime(call.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Aguardando</dt>
          <dd className="text-2xl font-bold text-warning">{formatDurationMinutes(waiting)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Em atendimento</dt>
          <dd className="text-2xl font-bold text-info">{formatDurationMinutes(attending)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Total</dt>
          <dd className="text-2xl font-bold text-foreground">{formatDurationMinutes(total)}</dd>
        </div>
        {call.technicianName && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Técnico</dt>
            <dd className="text-base font-bold text-foreground">{call.technicianName}</dd>
          </div>
        )}
        {call.notes && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">Observações</dt>
            <dd className="text-base text-foreground">{call.notes}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
