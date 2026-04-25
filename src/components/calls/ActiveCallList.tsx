import { Link } from "@tanstack/react-router";
import type { AndonCall } from "@/types/andon";
import { useTicker } from "@/hooks/useTicker";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { getAndonStatusLabel, getCallSubtypeLabel } from "@/utils/statusUtils";
import { BigButton } from "@/components/common/BigButton";
import { EmptyState } from "@/components/common/EmptyState";
import { Inbox } from "lucide-react";

interface ActiveCallListProps {
  calls: AndonCall[];
  onAttend: (callId: string) => void;
  onFinish: (callId: string) => void;
}

export function ActiveCallList({ calls, onAttend, onFinish }: ActiveCallListProps) {
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
                    (c.status === "open"
                      ? "bg-warning/20 text-warning"
                      : "bg-info/20 text-info")
                  }
                >
                  {getAndonStatusLabel(c.status)}
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                Aberto em <span className="font-mono">{formatDateTime(c.openedAt)}</span>
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
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {c.status === "open" && (
                <BigButton tone="info" size="md" onClick={() => onAttend(c.id)}>
                  Atender
                </BigButton>
              )}
              {c.status === "in_progress" && (
                <BigButton tone="success" size="md" onClick={() => onFinish(c.id)}>
                  Finalizar
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
