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
  formatElapsedSince,
  getLastMachineOccurrence,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  getAlertLevel,
  getCallSubtypeLabel,
  getDashboardCardAttentionTone,
} from "@/utils/statusUtils";

interface MachineCardProps {
  machine: Machine;
  productionPriorityRank?: number | null;
}

export function MachineCard({
  machine,
  productionPriorityRank = null,
}: MachineCardProps) {
  const { calls, settings } = useAndon();
  const currentCall = machine.currentCallId
    ? calls.find((c) => c.id === machine.currentCallId)
    : null;

  const hasLiveTimer = machine.machineStatus === "stopped" || Boolean(currentCall);
  useTicker(hasLiveTimer ? 1000 : 60000);

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
  const lastOccurrence = getLastMachineOccurrence(machine, calls);
  const lastOccurrenceDetails = lastOccurrence
    ? [
        lastOccurrence.kind === "call"
          ? `Chamado aberto em ${formatDateTime(lastOccurrence.occurredAt)}`
          : `Falha iniciada em ${formatDateTime(lastOccurrence.occurredAt)}`,
        lastOccurrence.kind === "failure" &&
        typeof lastOccurrence.durationMinutes === "number" &&
        lastOccurrence.durationMinutes > 0
          ? `Duração: ${formatDurationMinutes(lastOccurrence.durationMinutes)}`
          : null,
        lastOccurrence.kind === "failure" && lastOccurrence.endedAt
          ? `Encerrada em ${formatDateTime(lastOccurrence.endedAt)}`
          : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : "Nenhum chamado ou falha registrado";

  const isCritical = !isNotScheduled && (stoppedAlert === "critical" || callAlert === "critical");
  const isWarning = !isNotScheduled && (stoppedAlert === "warning" || callAlert === "warning");
  const cardAttentionTone = getDashboardCardAttentionTone(
    machine.machineStatus,
    machine.productionMode,
    currentCall?.status ?? machine.andonStatus,
  );
  const compactBadgeClass = "min-w-fit shrink-0 whitespace-nowrap gap-1 px-1.5 py-0.5 text-[9px] leading-none tracking-normal sm:text-[10px] 2xl:text-[11px]";

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col gap-1.5 overflow-visible rounded-xl border-2 bg-card p-2 shadow-md transition-all 2xl:gap-2 2xl:p-2.5",
        machine.machineStatus === "stopped" && !isNotScheduled ? "border-danger/60" : "border-border",
        isNotScheduled && "opacity-60 grayscale-[0.35]",
        isCritical && "ring-2 ring-danger",
        isWarning && !isCritical && "ring-2 ring-warning",
      )}
      data-production-priority={productionPriorityRank ?? undefined}
    >
      {cardAttentionTone && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -inset-1.5 rounded-[1rem] border-2",
            cardAttentionTone === "danger"
              ? "border-danger/80 text-danger animate-andon-card-halo-danger"
              : "border-warning/80 text-warning animate-andon-card-halo-warning",
          )}
        />
      )}

      {productionPriorityRank !== null && (
        <span
          className="absolute right-1.5 top-1.5 z-10 rounded-full border border-orange-500/55 bg-orange-500/12 px-3 py-1 text-[13px] font-black leading-none tracking-wide text-orange-400 sm:text-sm 2xl:text-[15px]"
          title={`Prioridade de produção P${productionPriorityRank}`}
        >
          P{productionPriorityRank}
        </span>
      )}

      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase leading-none tracking-widest text-muted-foreground 2xl:text-xs">Máquina</div>
          <div className="text-4xl font-black leading-none tracking-tight text-foreground 2xl:text-5xl">{machine.id}</div>
        </div>
      </div>

      <div className="-m-1.5 flex shrink-0 flex-wrap gap-1 overflow-visible p-1.5">
        <MachineStatusBadge status={machine.machineStatus} className={compactBadgeClass} />
        <AndonStatusBadge status={machine.andonStatus} className={compactBadgeClass} />
        <ProductionModeBadge productionMode={machine.productionMode} className={compactBadgeClass} />
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-visible px-1 text-xs leading-tight text-muted-foreground 2xl:text-sm">
        {machine.machineStatus === "stopped" && !isNotScheduled && (
          <div className="flex min-w-0 items-center justify-between gap-1.5 rounded-md bg-danger/10 px-2 py-1 font-bold text-danger ring-1 ring-danger/20 shadow-sm shadow-danger/20">
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Em falha
            </span>
            <strong className="min-w-0 truncate text-right text-foreground">{formatDurationMinutes(stoppedMin)}</strong>
          </div>
        )}
        {machine.machineStatus === "stopped" && isNotScheduled && (
          <div className="flex min-w-0 items-center gap-1 rounded-md bg-muted px-2 py-1 font-bold text-muted-foreground ring-1 ring-border/60 shadow-sm">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Fora de produção
          </div>
        )}
        {machine.machineStatus === "running" && (
          <div className="truncate rounded-md bg-muted/35 px-2 py-1" title={lastOccurrenceDetails}>
            Última ocorrência:{" "}
            <strong className="text-foreground">
              {formatElapsedSince(lastOccurrence?.occurredAt)}
            </strong>
          </div>
        )}

        {currentCall && (
          <div className="grid min-w-0 gap-1 rounded-lg border border-border bg-muted/40 p-1.5 shadow-sm shadow-background/20">
            <div className="flex min-w-0 items-center gap-1 text-xs font-black uppercase leading-tight text-foreground 2xl:text-sm">
              {currentCall.category === "maintenance" ? (
                <Wrench className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Bell className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{getCallSubtypeLabel(currentCall.subtype)}</span>
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
