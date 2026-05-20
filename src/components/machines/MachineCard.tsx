import { Link } from "@tanstack/react-router";
import { ChevronRight, Wrench, Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Machine } from "@/types/machine";
import { useAndon } from "@/context/AndonProvider";
import { useTicker } from "@/hooks/useTicker";
import { MachineStatusBadge } from "./MachineStatusBadge";
import { AndonStatusBadge } from "./AndonStatusBadge";
import { ProductionModeBadge } from "./ProductionModeBadge";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculateMachineStoppedMinutes,
  calculatePostMaintenanceMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import {
  getAlertLevel,
  getCallSubtypeLabel,
  getCriticalityColorClass,
  getCriticalityLabel,
} from "@/utils/statusUtils";
import { BigButton } from "@/components/common/BigButton";

interface MachineCardProps {
  machine: Machine;
  onOpenCall?: (machineId: string) => void;
  onAttend?: (callId: string) => void;
  onFinish?: (callId: string) => void;
  onCompleteMaintenance?: (callId: string) => void;
  onReturnToMaintenance?: (callId: string) => void;
}

export function MachineCard({
  machine,
  onOpenCall,
  onAttend,
  onFinish,
  onCompleteMaintenance,
  onReturnToMaintenance,
}: MachineCardProps) {
  useTicker(1000);
  const { calls, settings } = useAndon();
  const currentCall = machine.currentCallId
    ? calls.find((c) => c.id === machine.currentCallId)
    : null;

  const isNotScheduled = machine.productionMode === "not_scheduled";
  const stoppedMin = calculateMachineStoppedMinutes(machine);
  const stoppedAlert = getAlertLevel(
    stoppedMin,
    settings.alertRules.machineStoppedWarningMinutes,
    settings.alertRules.machineStoppedCriticalMinutes,
  );
  const waitingMin = currentCall ? calculateCallWaitingMinutes(currentCall) : 0;
  const attendingMin = currentCall ? calculateAttendanceMinutes(currentCall) : 0;
  const postMaintenanceMin = currentCall ? calculatePostMaintenanceMinutes(currentCall) : 0;
  const callAlert = currentCall
    ? getAlertLevel(
        waitingMin,
        settings.alertRules.callOpenWarningMinutes,
        settings.alertRules.callOpenCriticalMinutes,
      )
    : "normal";

  const isCritical = !isNotScheduled && (stoppedAlert === "critical" || callAlert === "critical");
  const isWarning = !isNotScheduled && (stoppedAlert === "warning" || callAlert === "warning");

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border-2 bg-card p-3 shadow-md transition-all",
        machine.machineStatus === "stopped" && !isNotScheduled ? "border-danger/60" : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Máquina</div>
          <div className="text-2xl font-black leading-none text-foreground md:text-3xl">{machine.id}</div>
        </div>
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Ver máquina"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <MachineStatusBadge status={machine.machineStatus} />
        <AndonStatusBadge status={machine.andonStatus} />
        <ProductionModeBadge productionMode={machine.productionMode} />
      </div>

      {currentCall && (
        <div className="rounded-lg bg-muted/40 p-2 text-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-foreground">
            {currentCall.category === "maintenance" ? (
              <Wrench className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            {getCallSubtypeLabel(currentCall.subtype)}
          </div>
          <div
            className={
              "mt-1.5 inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold " +
              getCriticalityColorClass(currentCall.criticality)
            }
          >
            Criticidade: {getCriticalityLabel(currentCall.criticality)}
          </div>
          {currentCall.status === "open" && (
            <div className="mt-1 text-xs text-muted-foreground">
              Aguardando há{" "}
              <strong className="text-foreground">{formatDurationMinutes(waitingMin)}</strong>
            </div>
          )}
          {currentCall.status === "in_progress" && (
            <div className="mt-1 text-xs text-muted-foreground">
              Em atendimento há{" "}
              <strong className="text-foreground">{formatDurationMinutes(attendingMin)}</strong>
            </div>
          )}
          {currentCall.status === "post_maintenance" && (
            <div className="mt-1 text-xs text-muted-foreground">
              Acompanhamento:{" "}
              <strong className="text-foreground">
                {formatDurationMinutes(postMaintenanceMin)}
              </strong>
            </div>
          )}
        </div>
      )}

      {machine.machineStatus === "stopped" && !isNotScheduled && (
        <div className="flex items-center gap-1.5 rounded-lg bg-danger/10 p-1.5 text-xs text-danger">
          <AlertTriangle className="h-3.5 w-3.5" />
          Em falha há <strong>{formatDurationMinutes(stoppedMin)}</strong>
        </div>
      )}
      {machine.machineStatus === "stopped" && isNotScheduled && (
        <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          Fora de produção
        </div>
      )}
      {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Última falha: {formatDurationMinutes(machine.lastStopDurationMinutes)}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1">
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
        {machine.andonStatus === "in_progress" && currentCall?.category === "maintenance" && (
          <BigButton tone="info" size="md" onClick={() => onCompleteMaintenance?.(currentCall.id)}>
            Concluir Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall?.category === "production" && (
          <BigButton tone="success" size="md" onClick={() => onFinish?.(currentCall.id)}>
            Finalizar
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall?.category === "maintenance" && (
          <BigButton tone="info" size="md" onClick={() => onReturnToMaintenance?.(currentCall.id)}>
            Voltar à Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall && (
          <BigButton tone="success" size="md" onClick={() => onFinish?.(currentCall.id)}>
            Finalizar Chamado
          </BigButton>
        )}
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold uppercase tracking-wide text-foreground hover:bg-accent"
        >
          Ver Máquina
        </Link>
      </div>
    </div>
  );
}
