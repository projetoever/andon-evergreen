import { Link } from "@tanstack/react-router";
import { ChevronRight, Wrench, Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Machine } from "@/types/machine";
import { useAndon } from "@/context/AndonProvider";
import { useTicker } from "@/hooks/useTicker";
import { MachineStatusBadge } from "./MachineStatusBadge";
import { AndonStatusBadge } from "./AndonStatusBadge";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculateMachineStoppedMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { getAlertLevel, getCallSubtypeLabel } from "@/utils/statusUtils";
import { BigButton } from "@/components/common/BigButton";

interface MachineCardProps {
  machine: Machine;
  onOpenCall?: (machineId: string) => void;
  onAttend?: (callId: string) => void;
  onFinish?: (callId: string) => void;
}

export function MachineCard({ machine, onOpenCall, onAttend, onFinish }: MachineCardProps) {
  useTicker(1000);
  const { calls, settings } = useAndon();
  const currentCall = machine.currentCallId
    ? calls.find((c) => c.id === machine.currentCallId)
    : null;

  const stoppedMin = calculateMachineStoppedMinutes(machine);
  const stoppedAlert = getAlertLevel(
    stoppedMin,
    settings.alertRules.machineStoppedWarningMinutes,
    settings.alertRules.machineStoppedCriticalMinutes,
  );
  const waitingMin = currentCall ? calculateCallWaitingMinutes(currentCall) : 0;
  const attendingMin = currentCall ? calculateAttendanceMinutes(currentCall) : 0;
  const callAlert = currentCall
    ? getAlertLevel(
        waitingMin,
        settings.alertRules.callOpenWarningMinutes,
        settings.alertRules.callOpenCriticalMinutes,
      )
    : "normal";

  const isCritical = stoppedAlert === "critical" || callAlert === "critical";
  const isWarning = stoppedAlert === "warning" || callAlert === "warning";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border-2 bg-card p-4 shadow-md transition-all",
        machine.machineStatus === "stopped" ? "border-danger/60" : "border-border",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Máquina</div>
          <div className="text-4xl font-black leading-none text-foreground">{machine.id}</div>
        </div>
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Ver máquina"
        >
          <ChevronRight className="h-6 w-6" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <MachineStatusBadge status={machine.machineStatus} />
        <AndonStatusBadge status={machine.andonStatus} />
      </div>

      {currentCall && (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-bold uppercase text-foreground">
            {currentCall.category === "maintenance" ? (
              <Wrench className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {getCallSubtypeLabel(currentCall.subtype)}
          </div>
          {currentCall.status === "open" && (
            <div className="mt-1 text-muted-foreground">
              Aguardando há <strong className="text-foreground">{formatDurationMinutes(waitingMin)}</strong>
            </div>
          )}
          {currentCall.status === "in_progress" && (
            <div className="mt-1 text-muted-foreground">
              Em atendimento há{" "}
              <strong className="text-foreground">{formatDurationMinutes(attendingMin)}</strong>
            </div>
          )}
        </div>
      )}

      {machine.machineStatus === "stopped" && (
        <div className="flex items-center gap-2 rounded-lg bg-danger/10 p-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          Parada há <strong>{formatDurationMinutes(stoppedMin)}</strong>
        </div>
      )}
      {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
        <div className="text-xs text-muted-foreground">
          Última parada: {formatDurationMinutes(machine.lastStopDurationMinutes)}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {machine.andonStatus === "none" && (
          <BigButton tone="warning" size="md" onClick={() => onOpenCall?.(machine.id)}>
            Abrir ANDON
          </BigButton>
        )}
        {machine.andonStatus === "open" && currentCall && (
          <BigButton tone="info" size="md" onClick={() => onAttend?.(currentCall.id)}>
            Atender
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall && (
          <BigButton tone="success" size="md" onClick={() => onFinish?.(currentCall.id)}>
            Finalizar
          </BigButton>
        )}
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold uppercase tracking-wider text-foreground hover:bg-accent"
        >
          Ver Máquina
        </Link>
      </div>
    </div>
  );
}
