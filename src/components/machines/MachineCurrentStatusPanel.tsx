import { HelpCircle } from "lucide-react";
import type { Machine } from "@/types/machine";
import { useTicker } from "@/hooks/useTicker";
import { cn } from "@/lib/utils";
import {
  calculateMachineStoppedMinutes,
  getActiveMachineStoppedAt,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { getMachineStatusLabel, getProductionModeLabel } from "@/utils/statusUtils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MachineCurrentStatusPanelProps {
  machine: Machine;
  className?: string;
  compactNormal?: boolean;
}

interface InfoHintProps {
  summary: string;
  detail: string;
}

function InfoHint({ summary, detail }: InfoHintProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{summary}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground transition hover:text-foreground"
              aria-label="Mais informações"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs border border-border bg-card text-card-foreground shadow-xl">
            {detail}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function formatLastFailureDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Sem registro";

  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes <= 0) return "Menos de 1 min";
  if (totalMinutes === 1) return "1 min";

  return `${totalMinutes} min`;
}

export function MachineCurrentStatusPanel({ machine, className, compactNormal = false }: MachineCurrentStatusPanelProps) {
  const isStopped = machine.machineStatus === "stopped";
  const isNotScheduled = machine.productionMode === "not_scheduled";

  useTicker(isStopped ? 1000 : 60000);

  const stoppedMin = calculateMachineStoppedMinutes(machine);
  const activeStoppedAt = getActiveMachineStoppedAt(machine);

  return (
    <div
      className={cn(
        compactNormal
          ? "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-md"
          : "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 shadow-md",
        isStopped && !isNotScheduled ? "border-danger/60" : "border-border",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground md:text-base">
            Status atual da máquina
          </h3>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {getProductionModeLabel(machine.productionMode)}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider",
            isStopped ? "bg-danger text-danger-foreground" : "bg-success text-success-foreground",
          )}
        >
          {getMachineStatusLabel(machine.machineStatus)}
        </span>
      </div>

      <dl className={cn(
        "grid min-h-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2",
        compactNormal ? "xl:grid-cols-3 xl:content-start" : "xl:grid-cols-3",
      )}>
        <div
          className={cn(
            compactNormal ? "rounded-lg border p-2.5" : "rounded-lg border p-2.5 sm:col-span-2 xl:col-span-1",
            isStopped ? "border-danger/30 bg-danger/10" : "border-success/30 bg-success/10",
          )}
        >
          <dt className="text-xs uppercase text-muted-foreground">Condição operacional</dt>
          <dd className={cn(compactNormal ? "mt-1 text-lg font-black" : "mt-1 text-xl font-black", isStopped ? "text-danger" : "text-success")}>
            {isStopped ? "Máquina em falha" : "Pronta para rodar"}
          </dd>
          <InfoHint
            summary={isStopped ? "Tempo contado desde a parada real." : "Sem falha ativa registrada."}
            detail={
              isStopped
                ? "O tempo usa a parada real da máquina. Ele pode ser maior que o tempo do ANDON quando a falha começou antes da abertura do chamado."
                : "A máquina está sem falha ativa no momento. O painel continua monitorando chamados ANDON e mudanças de status."
            }
          />
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-2.5">
          <dt className="text-xs uppercase text-muted-foreground">Última alteração de status</dt>
          <dd className="mt-1 font-mono text-sm text-foreground md:text-base">
            {formatDateTime(machine.lastStatusChangedAt)}
          </dd>
        </div>

        {isStopped && activeStoppedAt && (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5">
              <dt className="text-xs uppercase text-muted-foreground">Falha iniciada em</dt>
              <dd className="mt-1 font-mono text-sm text-foreground md:text-base">
                {formatDateTime(activeStoppedAt)}
              </dd>
            </div>
            <div className="rounded-lg border border-danger/40 bg-danger/15 p-2.5 sm:col-span-2 xl:col-span-3">
              <dt className="text-xs uppercase text-muted-foreground">Tempo total em falha</dt>
              <dd className="mt-1 text-2xl font-black leading-tight text-danger md:text-3xl">
                {formatDurationMinutes(stoppedMin)}
              </dd>
            </div>
          </>
        )}

        {!isStopped && (
          <div className={cn("rounded-lg border border-border bg-muted/20 p-2.5", compactNormal ? "" : "sm:col-span-2 xl:col-span-1")}>
            <dt className="text-xs uppercase text-muted-foreground">Última falha</dt>
            <dd className={cn("mt-1 font-bold text-foreground", compactNormal ? "text-lg" : "text-xl")}>
              {formatLastFailureDuration(machine.lastStopDurationMinutes)}
            </dd>
            {!compactNormal && (
              <InfoHint
                summary="Atualização automática."
                detail="Este indicador mostra a duração da última falha encerrada e é recalculado periodicamente pelo painel."
              />
            )}
          </div>
        )}
      </dl>
    </div>
  );
}
