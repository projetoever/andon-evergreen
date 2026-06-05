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
  const operationalActionCount = [
    machine.andonStatus === "none",
    machine.andonStatus === "open" && currentCall,
    machine.andonStatus === "in_progress" && currentCall,
    machine.andonStatus === "post_maintenance" && currentCall?.category === "maintenance",
    machine.andonStatus === "post_maintenance" && currentCall,
  ].filter(Boolean).length;
  const hasExpandedContent =
    Boolean(currentCall) ||
    (machine.machineStatus === "stopped" && !isNotScheduled) ||
    operationalActionCount > 1;
  const cardGapClass = hasExpandedContent ? "gap-1 p-2" : "gap-1.5 p-2.5";
  const machineNumberClass = hasExpandedContent ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl";
  const statusBadgeClass = hasExpandedContent
    ? "gap-1 px-1.5 py-0 text-[10px] leading-tight tracking-normal"
    : undefined;
  const callDetailClass = hasExpandedContent
    ? "p-1 text-[10px] leading-tight"
    : "p-1.5 text-[11px] leading-tight";
  const callTitleClass = hasExpandedContent ? "text-[10px] leading-tight" : "text-[11px]";
  const callMetaClass = hasExpandedContent ? "mt-0.5 text-[10px]" : "mt-1 text-[10px]";
  const timeTextClass = hasExpandedContent ? "mt-0 text-[10px]" : "mt-0.5 text-[11px]";
  const alertClass = hasExpandedContent ? "p-1 text-[10px]" : "p-1.5 text-[11px]";
  const actionGapClass = hasExpandedContent ? "gap-0.5 pt-0.5" : "gap-1 pt-1";
  const actionButtonClass = hasExpandedContent
    ? "min-h-[30px] rounded-lg px-2 text-[10px] leading-tight tracking-wide shadow-sm"
    : "min-h-[38px] px-3 text-xs";
  const viewMachineClass = hasExpandedContent
    ? "min-h-[30px] rounded-lg px-2 text-[10px] leading-tight tracking-wide"
    : "min-h-[36px] rounded-xl px-3 text-[11px] tracking-wide";

  return (
    <div
      className={cn(
        "flex h-full min-h-[13.5rem] flex-col rounded-xl border-2 bg-card shadow-md transition-all",
        cardGapClass,
        machine.machineStatus === "stopped" && !isNotScheduled
          ? "border-danger/60"
          : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div>
          <div
            className={cn(
              "uppercase tracking-widest text-muted-foreground",
              hasExpandedContent ? "text-[10px]" : "text-[11px]",
            )}
          >
            Máquina
          </div>
          <div
            className={cn(
              "font-black leading-none tracking-tight text-foreground",
              machineNumberClass,
            )}
          >
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

      <div className={cn("flex shrink-0 flex-wrap", hasExpandedContent ? "gap-0.5" : "gap-1")}>
        <MachineStatusBadge status={machine.machineStatus} className={statusBadgeClass} />
        <AndonStatusBadge status={machine.andonStatus} className={statusBadgeClass} />
        <ProductionModeBadge productionMode={machine.productionMode} className={statusBadgeClass} />
      </div>

      {currentCall && (
        <div className={cn("shrink-0 rounded-lg bg-muted/40", callDetailClass)}>
          <div
            className={cn(
              "flex items-center gap-1 font-bold uppercase text-foreground",
              callTitleClass,
            )}
          >
            {currentCall.category === "maintenance" ? (
              <Wrench className="h-3 w-3" />
            ) : (
              <Bell className="h-3 w-3" />
            )}
            {getCallSubtypeLabel(currentCall.subtype)}
          </div>
          <div
            className={
              cn("inline-flex rounded-md border px-1.5 py-0.5 font-bold", callMetaClass) +
              " " +
              getCriticalityColorClass(currentCall.criticality)
            }
          >
            Criticidade: {getCriticalityLabel(currentCall.criticality)}
          </div>
          {currentCall.status === "open" && (
            <div className={cn("text-muted-foreground", timeTextClass)}>
              Aguardando há{" "}
              <strong className="text-foreground">{formatDurationMinutes(waitingMin)}</strong>
            </div>
          )}
          {currentCall.status === "in_progress" && (
            <div className={cn("text-muted-foreground", timeTextClass)}>
              Em atendimento há{" "}
              <strong className="text-foreground">{formatDurationMinutes(attendingMin)}</strong>
            </div>
          )}
          {currentCall.status === "post_maintenance" && (
            <div className={cn("text-muted-foreground", timeTextClass)}>
              Acompanhamento:{" "}
              <strong className="text-foreground">
                {formatDurationMinutes(postMaintenanceMin)}
              </strong>
            </div>
          )}
        </div>
      )}

      {machine.machineStatus === "stopped" && !isNotScheduled && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg bg-danger/10 text-danger",
            alertClass,
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          Em falha há <strong>{formatDurationMinutes(stoppedMin)}</strong>
        </div>
      )}
      {machine.machineStatus === "stopped" && isNotScheduled && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg bg-muted text-muted-foreground",
            alertClass,
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          Fora de produção
        </div>
      )}
      {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
        <div className="shrink-0 text-[10px] leading-tight text-muted-foreground">
          Última falha: {formatDurationMinutes(machine.lastStopDurationMinutes)}
        </div>
      )}

      <div className={cn("mt-auto flex shrink-0 flex-col", actionGapClass)}>
        {machine.andonStatus === "none" && (
          <BigButton
            tone="warning"
            size="md"
            className={actionButtonClass}
            onClick={() => onOpenCall?.(machine.id)}
          >
            Abrir ANDON
          </BigButton>
        )}
        {machine.andonStatus === "open" && currentCall && (
          <BigButton
            tone="info"
            size="md"
            className={actionButtonClass}
            onClick={() => onAttend?.(currentCall.id)}
          >
            Atender
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall?.category === "maintenance" && (
          <BigButton
            tone="info"
            size="md"
            className={actionButtonClass}
            onClick={() => onCompleteMaintenance?.(currentCall.id)}
          >
            Concluir Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "in_progress" && currentCall?.category === "production" && (
          <BigButton
            tone="success"
            size="md"
            className={actionButtonClass}
            onClick={() => onFinish?.(currentCall.id)}
          >
            Finalizar
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall?.category === "maintenance" && (
          <BigButton
            tone="info"
            size="md"
            className={actionButtonClass}
            onClick={() => onReturnToMaintenance?.(currentCall.id)}
          >
            Voltar à Manutenção
          </BigButton>
        )}
        {machine.andonStatus === "post_maintenance" && currentCall && (
          <BigButton
            tone="success"
            size="md"
            className={actionButtonClass}
            onClick={() => onFinish?.(currentCall.id)}
          >
            Finalizar Chamado
          </BigButton>
        )}
        <Link
          to="/machines/$machineId"
          params={{ machineId: machine.id }}
          className={cn(
            "inline-flex items-center justify-center gap-2 border border-border bg-background font-bold uppercase text-foreground hover:bg-accent",
            viewMachineClass,
          )}
        >
          Ver Máquina
        </Link>
      </div>
    </div>
  );
}
