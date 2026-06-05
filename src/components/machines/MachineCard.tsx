import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bell, Wrench } from "lucide-react";
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

interface MachineCardProps {
  machine: Machine;
}

export function MachineCard({ machine }: MachineCardProps) {
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
  const callElapsedLabel = currentCall?.status === "open"
    ? "Aguardando"
    : currentCall?.status === "in_progress"
      ? "Atendimento"
      : currentCall?.status === "post_maintenance"
        ? "Acompanhamento"
        : null;
  const callElapsedMinutes = currentCall?.status === "open"
    ? waitingMin
    : currentCall?.status === "in_progress"
      ? attendingMin
      : currentCall?.status === "post_maintenance"
        ? postMaintenanceMin
        : null;

  const isCritical = !isNotScheduled && (stoppedAlert === "critical" || callAlert === "critical");
  const isWarning = !isNotScheduled && (stoppedAlert === "warning" || callAlert === "warning");
  const compactBadgeClass = "min-w-fit shrink-0 whitespace-nowrap gap-1 px-1.5 py-0.5 text-[9px] leading-none tracking-normal sm:text-[10px] 2xl:text-[11px]";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-1.5 rounded-xl border-2 bg-card p-2 shadow-md transition-all 2xl:gap-2 2xl:p-2.5",
        machine.machineStatus === "stopped" && !isNotScheduled ? "border-danger/60" : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground 2xl:text-xs">Máquina</div>
          <div className="text-4xl font-black leading-none tracking-tight text-foreground 2xl:text-5xl">{machine.id}</div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1 overflow-hidden">
        <MachineStatusBadge status={machine.machineStatus} className={compactBadgeClass} />
        <AndonStatusBadge status={machine.andonStatus} className={compactBadgeClass} />
        <ProductionModeBadge productionMode={machine.productionMode} className={compactBadgeClass} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden text-xs leading-tight text-muted-foreground 2xl:text-sm">
        {machine.machineStatus === "stopped" && !isNotScheduled && (
          <div className="flex items-center justify-between gap-1.5 rounded-md bg-danger/10 px-2 py-1 font-bold text-danger">
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Em falha
            </span>
            <strong className="min-w-0 truncate text-right text-foreground">{formatDurationMinutes(stoppedMin)}</strong>
          </div>
        )}
        {machine.machineStatus === "stopped" && isNotScheduled && (
          <div className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-bold text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Fora de produção
          </div>
        )}
        {machine.machineStatus === "running" && (
          <div className="truncate rounded-md bg-muted/35 px-2 py-1">
            Última falha: <strong className="text-foreground">{machine.lastStopDurationMinutes > 0 ? formatDurationMinutes(machine.lastStopDurationMinutes) : "sem registro"}</strong>
          </div>
        )}

        {currentCall && (
          <div className="grid gap-1 rounded-lg border border-border bg-muted/40 p-1.5">
            <div className="flex min-w-0 items-center gap-1 text-xs font-black uppercase leading-tight text-foreground 2xl:text-sm">
              {currentCall.category === "maintenance" ? (
                <Wrench className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Bell className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{getCallSubtypeLabel(currentCall.subtype)}</span>
            </div>
            <div
              className={
                "w-fit max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none 2xl:text-xs " +
                getCriticalityColorClass(currentCall.criticality)
              }
            >
              Criticidade: {getCriticalityLabel(currentCall.criticality)}
            </div>
            {callElapsedLabel && callElapsedMinutes !== null && (
              <div className="truncate text-xs text-muted-foreground 2xl:text-sm">
                {callElapsedLabel}: <strong className="text-foreground">{formatDurationMinutes(callElapsedMinutes)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <Link
        to="/machines/$machineId"
        params={{ machineId: machine.id }}
        className="inline-flex min-h-[34px] shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2 text-[11px] font-black uppercase tracking-wide text-foreground transition hover:bg-accent 2xl:min-h-[38px] 2xl:text-xs"
      >
        Ver Máquina
      </Link>
    </div>
  );
}
