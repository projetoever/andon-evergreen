import { Link } from "@tanstack/react-router";
import type { AndonCall } from "@/types/andon";
import { useTicker } from "@/hooks/useTicker";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculatePostMaintenanceMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import {
  getAndonStatusLabel,
  getCallSubtypeLabel,
  getCriticalityColorClass,
  getCriticalityLabel,
} from "@/utils/statusUtils";
import { BigButton } from "@/components/common/BigButton";
import { EmptyState } from "@/components/common/EmptyState";
import { Inbox } from "lucide-react";

interface ActiveCallListProps {
  calls: AndonCall[];
  onAttend: (callId: string) => void;
  onFinish: (callId: string) => void;
  onCancel: (callId: string) => void;
  onCompleteMaintenance: (callId: string) => void;
  onReturnToMaintenance: (callId: string) => void;
}

export function ActiveCallList({
  calls,
  onAttend,
  onFinish,
  onCancel,
  onCompleteMaintenance,
  onReturnToMaintenance,
}: ActiveCallListProps) {
  useTicker(1000);
  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-12 w-12" />}
        title="Nenhum chamado ativo"
        description="Quando um operador abrir um ANDON, ele aparecerá aqui."
      />
    );
  }
  return (
    <div className="space-y-3">
      {calls.map((c) => {
        const waiting = calculateCallWaitingMinutes(c);
        const attending = calculateAttendanceMinutes(c);
        const postMaintenance = calculatePostMaintenanceMinutes(c);
        return (
          <div
            key={c.id}
            className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 lg:grid-cols-[120px_1fr_auto] lg:items-center"
          >
            <div>
              <div className="text-xs uppercase text-muted-foreground">Máquina</div>
              <div className="text-5xl font-black text-foreground">{c.machineId}</div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold uppercase">
                  {c.category === "maintenance" ? "Manutenção" : "Produção"}
                </span>
                <span className="text-lg font-bold">{getCallSubtypeLabel(c.subtype)}</span>
                <span
                  className={
                    "rounded-md px-2 py-1 text-xs font-bold uppercase " +
                    (c.status === "open" ? "bg-warning/20 text-warning" : "bg-info/20 text-info")
                  }
                >
                  {getAndonStatusLabel(c.status)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Aberto em <span className="font-mono">{formatDateTime(c.openedAt)}</span>
              </div>
              <div
                className={
                  "w-fit rounded-md border px-2 py-1 text-xs font-bold " +
                  getCriticalityColorClass(c.criticality)
                }
              >
                Criticidade: {getCriticalityLabel(c.criticality)}
              </div>
              <div className="text-sm">
                Aguardando:{" "}
                <strong className="text-warning">{formatDurationMinutes(waiting)}</strong>
                {c.attendedAt && (
                  <>
                    {" · "}Em atendimento:{" "}
                    <strong className="text-info">{formatDurationMinutes(attending)}</strong>
                  </>
                )}
                {c.status === "post_maintenance" && (
                  <>
                    {" · "}Acompanhamento:{" "}
                    <strong className="text-info">{formatDurationMinutes(postMaintenance)}</strong>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.status === "open" && (
                <BigButton tone="info" size="md" onClick={() => onAttend(c.id)}>
                  Atender
                </BigButton>
              )}
              {c.status === "open" && !c.attendedAt && !(c.technicianSessions ?? []).length && (
                <BigButton tone="danger" size="md" onClick={() => onCancel(c.id)}>
                  Cancelar chamado
                </BigButton>
              )}
              {c.status === "in_progress" && c.category === "maintenance" && (
                <BigButton tone="info" size="md" onClick={() => onCompleteMaintenance(c.id)}>
                  Concluir Manutenção
                </BigButton>
              )}
              {c.status === "in_progress" && c.category === "production" && (
                <BigButton tone="success" size="md" onClick={() => onFinish(c.id)}>
                  Finalizar
                </BigButton>
              )}
              {c.status === "post_maintenance" && c.category === "maintenance" && (
                <BigButton tone="info" size="md" onClick={() => onReturnToMaintenance(c.id)}>
                  Voltar à Manutenção
                </BigButton>
              )}
              {c.status === "post_maintenance" && (
                <BigButton tone="success" size="md" onClick={() => onFinish(c.id)}>
                  Finalizar Chamado
                </BigButton>
              )}
              <Link
                to="/machines/$machineId"
                params={{ machineId: c.machineId }}
                className="inline-flex min-h-[56px] items-center justify-center rounded-xl border border-border bg-background px-6 text-base font-bold uppercase tracking-wider text-foreground hover:bg-accent"
              >
                Ver Máquina
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
