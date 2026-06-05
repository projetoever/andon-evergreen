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
        "flex h-full min-h-[13.5rem] flex-col gap-1.5 rounded-xl border-2 bg-card p-2.5 shadow-md transition-all",
        machine.machineStatus === "stopped" && !isNotScheduled
          ? "border-danger/60"
          : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="shrink-0 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Máquina</div>
          <div className="text-4xl font-black leading-none tracking-tight text-foreground md:text-5xl">
            {machine.id}
          </div>
        </div>
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Ver máquina"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="shrink-0 flex flex-wrap gap-1">
        <MachineStatusBadge status={machine.machineStatus} />
        <AndonStatusBadge status={machine.andonStatus} />
        <ProductionModeBadge productionMode={machine.productionMode} />
      </div>

      {currentCall && (
        <div className="shrink-0 rounded-lg bg-muted/40 p-1.5 text-[11px] leading-tight">
          <div className="flex items-center gap-1 text-[11px] font-bold uppercase text-foreground">
            {currentCall.category === "maintenance" ? (
              <Wrench className="h-3 w-3" />
            ) : (
              <Bell className="h-3 w-3" />
            )}
            {getCallSubtypeLabel(currentCall.subtype)}
          </div>
          <div
            className={
              "mt-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-bold " +
              getCriticalityColorClass(currentCall.criticality)
            }
          >
            Criticidade: {getCriticalityLabel(currentCall.criticality)}
          </div>
          {currentCall.status === "open" && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Aguardando há{" "}
              <strong className="text-foreground">{formatDurationMinutes(waitingMin)}</strong>
            </div>
          )}
          {currentCall.status === "in_progress" && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Em atendimento há{" "}
              <strong className="text-foreground">{formatDurationMinutes(attendingMin)}</strong>
            </div>
          )}
          {currentCall.status === "post_maintenance" && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Acompanhamento:{" "}
              <strong className="text-foreground">
                {formatDurationMinutes(postMaintenanceMin)}
              </strong>
            </div>
          )}
        </div>
      )}

      {machine.machineStatus === "stopped" && !isNotScheduled && (
        <div className="shrink-0 flex items-center gap-1 rounded-lg bg-danger/10 p-1.5 text-[11px] text-danger">
          <AlertTriangle className="h-3 w-3" />
          Em falha há <strong>{formatDurationMinutes(stoppedMin)}</strong>
        </div>
      )}
      {machine.machineStatus === "stopped" && isNotScheduled && (
        <div className="shrink-0 flex items-center gap-1 rounded-lg bg-muted p-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          Fora de produção
        </div>
      )}
      {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
        <div className="shrink-0 text-[10px] text-muted-foreground">
          Última falha: {formatDurationMinutes(machine.lastStopDurationMinutes)}
        </div>
      )}

      <div className="mt-auto flex shrink-0 flex-col gap-1 pt-1">
        {machine.andonStatus === "none" && (
          <BigButton
            tone="warning"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onOpenCall?.(machine.id)}
          >
            Abrir ANDON
          </BigButton>
        )}
        {machine.andonStatus === "open" && currentCall && (
          <BigButton
            tone="info"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onAttend?.(currentCall.id)}
          >
            Atender
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall?.category === "maintenance" && (
          <BigButton
            tone="info"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onCompleteMaintenance?.(currentCall.id)}
          >
            Concluir Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall?.category === "production" && (
          <BigButton
            tone="success"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onFinish?.(currentCall.id)}
          >
            Finalizar
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall?.category === "maintenance" && (
          <BigButton
            tone="info"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onReturnToMaintenance?.(currentCall.id)}
          >
            Voltar à Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall && (
          <BigButton
            tone="success"
            size="md"
            className="min-h-[38px] px-3 text-xs"
            onClick={() => onFinish?.(currentCall.id)}
          >
            Finalizar Chamado
          </BigButton>
        )}
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-[11px] font-bold uppercase tracking-wide text-foreground hover:bg-accent"
        >
          Ver Máquina
        </Link>
      </div>
    </div>
  );
}
