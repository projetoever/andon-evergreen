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
  getTechnicianAreaLabel,
} from "@/utils/statusUtils";

interface MachineCardProps {
  machine: Machine;
}

function getCategoryLabel(category: string): string {
  return category === "maintenance" ? "Manutenção" : "Produção";
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
      ? "Em atendimento"
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
  const callAreaLabel = currentCall?.technicianArea
    ? getTechnicianAreaLabel(currentCall.technicianArea)
    : getCategoryLabel(currentCall?.category ?? "production");

  const isCritical = !isNotScheduled && (stoppedAlert === "critical" || callAlert === "critical");
  const isWarning = !isNotScheduled && (stoppedAlert === "warning" || callAlert === "warning");

  return (
    <div
      className={cn(
        "flex h-full min-h-[250px] flex-col gap-2 rounded-xl border-2 bg-card p-3 shadow-md transition-all",
        machine.machineStatus === "stopped" && !isNotScheduled ? "border-danger/60" : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger animate-andon-pulse",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Máquina</div>
          <div className="text-5xl font-black leading-none tracking-tight text-foreground md:text-6xl">{machine.id}</div>
        </div>
        <div className="rounded-lg bg-muted px-2.5 py-1 text-xs font-black uppercase tracking-wide text-muted-foreground">
          Monitor
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[12px] [&>*]:px-2 [&>*]:py-1 [&>*]:text-[11px] md:[&>*]:text-xs">
        <MachineStatusBadge status={machine.machineStatus} />
        <AndonStatusBadge status={machine.andonStatus} />
        <ProductionModeBadge productionMode={machine.productionMode} />
      </div>

      <div className="grid gap-1.5 text-sm leading-snug text-muted-foreground">
        {machine.machineStatus === "stopped" && !isNotScheduled && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-2.5 py-2 text-danger">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-4 w-4" /> Tempo em falha
            </span>
            <strong className="text-base leading-none">{formatDurationMinutes(stoppedMin)}</strong>
          </div>
        )}
        {machine.machineStatus === "stopped" && isNotScheduled && (
          <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-2 font-bold text-muted-foreground">
            <AlertTriangle className="h-4 w-4" /> Fora de produção
          </div>
        )}
        {machine.machineStatus === "running" && machine.lastStopDurationMinutes > 0 && (
          <div className="rounded-lg bg-muted/35 px-2.5 py-2">
            Última falha: <strong className="text-foreground">{formatDurationMinutes(machine.lastStopDurationMinutes)}</strong>
          </div>
        )}
        {machine.machineStatus === "running" && machine.lastStopDurationMinutes <= 0 && (
          <div className="rounded-lg bg-muted/35 px-2.5 py-2">
            Última falha: <strong className="text-foreground">sem registro</strong>
          </div>
        )}
      </div>

      {currentCall && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-sm leading-snug">
          <div className="flex items-center gap-1.5 text-sm font-black uppercase text-foreground">
            {currentCall.category === "maintenance" ? (
              <Wrench className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            {getCallSubtypeLabel(currentCall.subtype)}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-background/70 px-2 py-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Área/Categoria</div>
              <div className="font-bold text-foreground">{callAreaLabel}</div>
            </div>
            <div
              className={
                "rounded-lg border px-2 py-1.5 font-bold " +
                getCriticalityColorClass(currentCall.criticality)
              }
            >
              <div className="text-[10px] uppercase tracking-wide opacity-80">Criticidade</div>
              <div>{getCriticalityLabel(currentCall.criticality)}</div>
            </div>
          </div>
          {callElapsedLabel && callElapsedMinutes !== null && (
            <div className="mt-1.5 rounded-lg bg-background/70 px-2 py-1.5 text-muted-foreground">
              {callElapsedLabel} há <strong className="text-base text-foreground">{formatDurationMinutes(callElapsedMinutes)}</strong>
            </div>
          )}
        </div>
      )}

      {!currentCall && (
        <div className="rounded-xl border border-dashed border-border px-2.5 py-2 text-sm font-semibold text-muted-foreground">
          Sem chamado ANDON ativo
        </div>
      )}

      <Link
        to="/machines/$machineId"
        params={{ machineId: machine.id }}
        className="mt-auto inline-flex min-h-[46px] w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-black uppercase tracking-wider text-foreground transition hover:bg-accent md:text-base"
      >
        Ver Máquina
      </Link>
    </div>
  );
}
