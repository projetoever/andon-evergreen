import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning, History, Pencil, Save } from "lucide-react";
import { toast } from "sonner";

import { CallIdLabel } from "@/components/common/CallIdLabel";
import { EmptyState } from "@/components/common/EmptyState";
import { useAndon } from "@/context/AndonProvider";
import { cn } from "@/lib/utils";
import { getFailureClassificationConfigs } from "@/services/failureClassificationConfigService";
import type { FailureClassification, Machine, MachineStopEvent } from "@/types/machine";
import type { FailureClassificationConfig } from "@/types/settings";
import { getEffectiveAssetLocationLabel } from "@/utils/assetLocationUtils";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculatePostMaintenanceMinutes,
  calculateTotalCallMinutes,
  diffMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import {
  getAndonStatusLabel,
  getCallSubtypeLabel,
  getCriticalityLabel,
  getMachineConditionLabel,
  getStatusColorClass,
  getTechnicianAreaLabel,
} from "@/utils/statusUtils";
import { formatTechnicianDisplayName } from "@/utils/technicianDisplayUtils";
import { buildTechnicianTimeAllocations } from "@/utils/technicianTimeAllocationUtils";
import {
  calculateOperationalImpactBreakdown,
  calculateProductionModeBreakdownForPeriod,
  formatBreakdownDuration,
} from "@/utils/timeBreakdownUtils";

interface MachineCallHistoryPageProps {
  machineId: string;
}

const PLACEHOLDER_CLASSIFICATION: FailureClassification = "real_machine_failure";

function getFailureClassificationLabel(
  classification: FailureClassification | undefined,
  catalogByValue: Map<string, FailureClassificationConfig>,
) {
  const value = classification ?? PLACEHOLDER_CLASSIFICATION;
  return catalogByValue.get(value)?.label ?? `Classificação não cadastrada (${value})`;
}

interface FailureEventCardProps {
  event: MachineStopEvent;
  machine: Machine;
  classifications: FailureClassificationConfig[];
  catalogByValue: Map<string, FailureClassificationConfig>;
  catalogLoading: boolean;
  catalogError: string | null;
  isEditing: boolean;
  editingText: string;
  editingClassification: FailureClassification;
  onStartEditing: (event: MachineStopEvent) => void;
  onEditingTextChange: (value: string) => void;
  onEditingClassificationChange: (value: FailureClassification) => void;
  onCancelEditing: () => void;
  onSave: (event: MachineStopEvent) => void;
}

function FailureEventCard({
  event,
  machine,
  classifications,
  catalogByValue,
  catalogLoading,
  catalogError,
  isEditing,
  editingText,
  editingClassification,
  onStartEditing,
  onEditingTextChange,
  onEditingClassificationChange,
  onCancelEditing,
  onSave,
}: FailureEventCardProps) {
  const now = new Date();
  const periodEnd = event.resumedAt ?? now.toISOString();
  const duration = event.resumedAt
    ? event.durationMinutes
    : diffMinutes(event.stoppedAt, periodEnd);
  const productionBreakdown = calculateProductionModeBreakdownForPeriod({
    periodStart: event.stoppedAt,
    periodEnd,
    productionHistory: machine.productionHistory,
    fallbackProductionMode:
      event.productionModeAtStart ?? event.productionModeAtEnd ?? machine.productionMode,
    now,
  });
  const selectableClassifications = classifications.filter(
    (option) => option.active || option.value === editingClassification,
  );

  return (
    <article className="rounded-lg border border-border bg-card p-3">
      <dl className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Início da falha</dt>
          <dd className="font-mono text-sm">{formatDateTime(event.stoppedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Retorno da máquina</dt>
          <dd className="font-mono text-sm">
            {event.resumedAt ? formatDateTime(event.resumedAt) : "Em aberto"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Duração</dt>
          <dd className="font-bold">{formatDurationMinutes(duration)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Classificação</dt>
          <dd className="font-bold">
            {getFailureClassificationLabel(event.failureClassification, catalogByValue)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">Status</dt>
          <dd className="font-bold">{event.resumedAt ? "Encerrada" : "Em aberto"}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs uppercase text-muted-foreground">Descrição da ocorrência</dt>
          <dd className="text-foreground">
            {isEditing ? (
              <div className="mt-1 flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Classificação da ocorrência
                </label>
                <select
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                  value={editingClassification}
                  onChange={(changeEvent) =>
                    onEditingClassificationChange(changeEvent.target.value)
                  }
                  disabled={catalogLoading || Boolean(catalogError)}
                >
                  {selectableClassifications.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.label}
                      {option.active ? "" : " (Inativa)"}
                    </option>
                  ))}
                </select>
                {editingClassification === PLACEHOLDER_CLASSIFICATION && (
                  <p className="text-xs font-bold text-amber-500">
                    Selecione uma classificação específica para a ocorrência.
                  </p>
                )}
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Descrição da ocorrência
                </label>
                <textarea
                  className="min-h-[88px] rounded-xl border border-border bg-background p-3 text-sm"
                  value={editingText}
                  onChange={(changeEvent) => onEditingTextChange(changeEvent.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSave(event)}
                    className="inline-flex items-center gap-2 self-start rounded-xl bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground"
                    disabled={catalogLoading || Boolean(catalogError)}
                  >
                    <Save className="h-4 w-4" />
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEditing}
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-bold uppercase tracking-wider"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <span className="whitespace-pre-line">
                  {event.failureDescription || "Sem descrição"}
                </span>
                <button
                  type="button"
                  onClick={() => onStartEditing(event)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold uppercase tracking-wider"
                  disabled={catalogLoading || Boolean(catalogError)}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
              </div>
            )}
          </dd>
        </div>
      </dl>

      <section className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
        <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
          Impacto da falha
        </h4>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <dt>Impacto durante produção programada</dt>
            <dd className="font-bold">
              {formatBreakdownDuration(productionBreakdown.scheduledSeconds)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt>Impacto fora de produção programada</dt>
            <dd className="font-bold">
              {formatBreakdownDuration(productionBreakdown.notScheduledSeconds)}
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}

export function MachineCallHistoryPage({ machineId }: MachineCallHistoryPageProps) {
  const { machines, calls, updateMachineStopEventDescription } = useAndon();
  const [expandedCallIds, setExpandedCallIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingClassification, setEditingClassification] = useState<FailureClassification>(
    PLACEHOLDER_CLASSIFICATION,
  );
  const [classifications, setClassifications] = useState<FailureClassificationConfig[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const machine = machines.find((item) => item.id === machineId);
  const machineCalls = calls
    .filter((call) => call.machineId === machineId)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.finishedAt ?? b.openedAt).getTime() -
        new Date(a.finishedAt ?? a.openedAt).getTime(),
    );

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError(null);
    void getFailureClassificationConfigs()
      .then((catalog) => {
        if (active) setClassifications(catalog);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogError(
          error instanceof Error ? error.message : "Falha ao carregar o catálogo central.",
        );
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const catalogByValue = useMemo(
    () => new Map(classifications.map((item) => [item.value, item])),
    [classifications],
  );

  if (!machine) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  const stopHistory = machine.stopHistory
    .slice()
    .sort((a, b) => new Date(b.stoppedAt).getTime() - new Date(a.stoppedAt).getTime());
  const callIds = new Set(machineCalls.map((call) => call.id));
  const failureEventsByCallId = new Map<string, MachineStopEvent[]>();
  const orphanFailureEvents: MachineStopEvent[] = [];

  for (const event of stopHistory) {
    if (!event.callId || !callIds.has(event.callId)) {
      orphanFailureEvents.push(event);
      continue;
    }
    const linkedEvents = failureEventsByCallId.get(event.callId) ?? [];
    linkedEvents.push(event);
    failureEventsByCallId.set(event.callId, linkedEvents);
  }

  const startEditingFailure = (event: MachineStopEvent) => {
    setEditingId(event.id);
    setEditingText(event.failureDescription || "");
    setEditingClassification(event.failureClassification ?? PLACEHOLDER_CLASSIFICATION);
  };

  const saveFailure = (event: MachineStopEvent) => {
    if (editingClassification === PLACEHOLDER_CLASSIFICATION) {
      toast.error("Selecione uma classificação específica para a ocorrência.");
      return;
    }
    updateMachineStopEventDescription(
      machine.id,
      event.id,
      editingText.trim(),
      editingClassification,
    );
    setEditingId(null);
  };

  const renderFailureEvent = (event: MachineStopEvent) => (
    <FailureEventCard
      key={event.id}
      event={event}
      machine={machine}
      classifications={classifications}
      catalogByValue={catalogByValue}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      isEditing={editingId === event.id}
      editingText={editingText}
      editingClassification={editingClassification}
      onStartEditing={startEditingFailure}
      onEditingTextChange={setEditingText}
      onEditingClassificationChange={setEditingClassification}
      onCancelEditing={() => setEditingId(null)}
      onSave={saveFailure}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center gap-3">
          <Link
            to="/machines/$machineId"
            params={{ machineId }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-11 md:w-11"
            aria-label="Voltar para a máquina"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Máquina {machine.id}
            </div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">
              Histórico de Chamados
            </h1>
            <p className="text-sm text-muted-foreground">{machine.name}</p>
          </div>
        </div>
      </div>

      {catalogLoading && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          Carregando catálogo central de classificações...
        </p>
      )}
      {catalogError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-bold">Catálogo central de classificações indisponível.</p>
          <p>{catalogError}</p>
        </div>
      )}

      {machineCalls.length === 0 ? (
        <EmptyState
          icon={<History className="h-12 w-12" />}
          title="Sem chamados registrados"
          description="Quando houver chamados para esta máquina, eles aparecerão aqui."
        />
      ) : (
        <div className="space-y-2">
          {machineCalls.map((call) => {
            const now = new Date();
            const linkedFailureEvents = failureEventsByCallId.get(call.id) ?? [];
            const isClosedCall = call.status === "finished" || call.status === "cancelled";
            const waitingMinutes = isClosedCall
              ? call.callWaitingMinutes
              : calculateCallWaitingMinutes(call);
            const attendanceMinutes = isClosedCall
              ? call.attendanceMinutes
              : calculateAttendanceMinutes(call);
            const postMaintenanceMinutes = isClosedCall
              ? call.postMaintenanceMinutes
              : calculatePostMaintenanceMinutes(call);
            const totalMinutes = isClosedCall
              ? call.totalCallMinutes
              : calculateTotalCallMinutes(call);
            const isMaintenance = requiresMaintenanceTechnician(call);
            const hasTechnicianNames =
              call.technicianNames.length > 0 || Boolean(call.technicianName);
            const technicianNames =
              call.technicianNames.length > 0
                ? call.technicianNames.join(", ")
                : call.technicianName
                  ? formatTechnicianDisplayName(call.technicianName)
                  : isMaintenance
                    ? "Sem manutentor apontado"
                    : "Não aplicável";
            const effectiveAssetLocation = getEffectiveAssetLocationLabel(call, "Não informado");
            const isExpanded = expandedCallIds.includes(call.id);

            const impactPeriodStart = call.openedAt;
            const impactPeriodEnd = call.finishedAt ?? now.toISOString();
            const callImpactHistory =
              call.impactTrackingVersion === 1
                ? (call.impactIntervals ?? []).map((interval) => ({
                    id: interval.id,
                    machineId: interval.machineId,
                    callId: interval.callId,
                    stoppedAt: interval.startedAt,
                    resumedAt: interval.endedAt,
                    durationMinutes:
                      typeof interval.durationSeconds === "number"
                        ? interval.durationSeconds / 60
                        : 0,
                    source: "system" as const,
                    failureClassification: "unidentified_stop" as const,
                  }))
                : machine.stopHistory;
            const impactBreakdown = calculateOperationalImpactBreakdown({
              periodStart: impactPeriodStart,
              periodEnd: impactPeriodEnd,
              stopHistory: callImpactHistory,
              productionHistory: machine.productionHistory,
              fallbackMachineCondition:
                call.impactTrackingVersion === 1
                  ? "running"
                  : (call.machineStatusAtOpen ??
                    call.machineCondition ??
                    call.machineStatusAtAttend ??
                    call.machineStatusAtFinish ??
                    machine.machineStatus),
              fallbackProductionMode:
                call.productionModeAtOpen ??
                call.productionModeAtAttend ??
                call.productionModeAtFinish ??
                machine.productionMode,
              now,
            });

            const sessions = call.technicianSessions ?? [];
            const allocations = Array.isArray(call.technicianTimeAllocations)
              ? call.technicianTimeAllocations
              : [];
            const finalTechnicianNames =
              call.technicianNames.length > 0
                ? call.technicianNames
                : call.technicianName
                  ? [call.technicianName]
                  : [];
            const allocationRows = buildTechnicianTimeAllocations({
              call,
              finalizedAt: call.finishedAt ?? call.maintenanceCompletedAt ?? now.toISOString(),
              technicianNames: finalTechnicianNames,
            }).map((allocation, index) => ({
              id:
                allocation.technicianId ??
                `${allocation.technicianName}-${allocation.source}-${index}`,
              technicianName: formatTechnicianDisplayName(allocation.technicianName),
              startedAt: allocation.startedAt ?? null,
              endedAt: allocation.endedAt ?? null,
              minutes: typeof allocation.minutes === "number" ? allocation.minutes : 0,
              source: allocation.source,
            }));

            const hasLegacyUnassignedAttendance =
              isMaintenance &&
              Boolean(call.attendedAt) &&
              finalTechnicianNames.length === 0 &&
              sessions.length === 0;
            const legacyUnassignedAllocation = allocations.find(
              (allocation) => allocation.source === "unassigned_time",
            );
            const technicianRows =
              hasLegacyUnassignedAttendance && legacyUnassignedAllocation
                ? [
                    ...allocationRows,
                    {
                      id: `${call.id}-legacy-unassigned`,
                      technicianName: "Sem manutentor apontado",
                      startedAt: legacyUnassignedAllocation.startedAt,
                      endedAt: legacyUnassignedAllocation.endedAt,
                      minutes: legacyUnassignedAllocation.minutes,
                      source: legacyUnassignedAllocation.source,
                    },
                  ]
                : allocationRows;

            const shouldShowTechnicianSection =
              isMaintenance || sessions.length > 0 || allocations.length > 0 || hasTechnicianNames;

            return (
              <article
                key={call.id}
                className={cn(
                  "rounded-lg border bg-card p-3",
                  call.status === "cancelled" ? "border-muted opacity-80" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      {formatDateTime(call.finishedAt ?? call.openedAt)}
                    </div>
                    <h2 className="truncate text-base font-black text-foreground md:text-lg">
                      {call.category === "maintenance" ? "Manutenção" : "Produção"} •{" "}
                      {getCallSubtypeLabel(call.subtype)}
                    </h2>
                    <CallIdLabel callId={call.id} className="mt-0.5" />
                    {call.workOrderNumber && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        OS:{" "}
                        <span className="font-bold text-foreground">{call.workOrderNumber}</span>
                      </div>
                    )}
                    {call.isSystemTest && (
                      <div className="mt-1 w-fit rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-warning">
                        Teste automático
                      </div>
                    )}
                    <div className="mt-1 w-fit max-w-full truncate rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      Localização: {effectiveAssetLocation}
                    </div>
                    {call.assetLocationChanged && (
                      <div className="mt-1 w-fit rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-warning">
                        Corrigida na finalização
                      </div>
                    )}
                    <div className="mt-1 text-sm text-muted-foreground">
                      Tempo total:{" "}
                      <span className="font-bold text-foreground">
                        {formatDurationMinutes(totalMinutes)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Manutentores: {technicianNames}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                        getStatusColorClass(call.status),
                      )}
                    >
                      {getAndonStatusLabel(call.status)}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-info hover:underline"
                      onClick={() =>
                        setExpandedCallIds((previousIds) =>
                          previousIds.includes(call.id)
                            ? previousIds.filter((id) => id !== call.id)
                            : [...previousIds, call.id],
                        )
                      }
                    >
                      {isExpanded ? "Ocultar detalhes" : "Mais detalhes"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Chamado
                      </h3>
                      <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="sm:col-span-2 lg:col-span-4">
                          <dt className="text-xs uppercase text-muted-foreground">ID do chamado</dt>
                          <dd>
                            <CallIdLabel callId={call.id} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">Tipo</dt>
                          <dd className="font-bold">
                            {call.category === "maintenance" ? "Manutenção" : "Produção"} •{" "}
                            {getCallSubtypeLabel(call.subtype)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">Status</dt>
                          <dd className="font-bold">{getAndonStatusLabel(call.status)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">Criticidade</dt>
                          <dd className="font-bold">{getCriticalityLabel(call.criticality)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">Localização</dt>
                          <dd className="font-bold">{effectiveAssetLocation}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            Condição ao abrir
                          </dt>
                          <dd className="font-bold">
                            {getMachineConditionLabel(call.machineCondition)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">Área técnica</dt>
                          <dd className="font-bold">
                            {getTechnicianAreaLabel(call.technicianArea)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            Conclusão da manutenção
                          </dt>
                          <dd className="font-mono">
                            {formatDateTime(call.maintenanceCompletedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {call.status === "cancelled" ? "Cancelado em" : "Finalizado em"}
                          </dt>
                          <dd className="font-mono">{formatDateTime(call.finishedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            Retornos à manutenção
                          </dt>
                          <dd className="font-bold">{call.maintenanceReturnCount}</dd>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-4">
                          <dt className="text-xs uppercase text-muted-foreground">Descrição</dt>
                          <dd className="whitespace-pre-line">{call.notes || "Sem descrição"}</dd>
                        </div>
                        {call.assetLocationChanged && call.assetChangeReason && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              Justificativa da correção
                            </dt>
                            <dd className="whitespace-pre-line font-semibold text-warning">
                              {call.assetChangeReason}
                            </dd>
                          </div>
                        )}
                        {call.status === "cancelled" && call.cancelReason && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              Justificativa do cancelamento
                            </dt>
                            <dd className="whitespace-pre-line font-semibold">
                              {call.cancelReason}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </section>

                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Falha
                      </h3>
                      {linkedFailureEvents.length > 0 ? (
                        <div className="space-y-2">
                          {linkedFailureEvents.map(renderFailureEvent)}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nenhuma ocorrência de falha vinculada a este chamado.
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Tempos
                      </h3>
                      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt>Tempo de ANDON</dt>
                          <dd className="font-bold text-warning">
                            {formatDurationMinutes(waitingMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>Tempo de atendimento</dt>
                          <dd className="font-bold text-info">
                            {formatDurationMinutes(attendanceMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>Tempo de acompanhamento</dt>
                          <dd className="font-bold text-info">
                            {formatDurationMinutes(postMaintenanceMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>Tempo total</dt>
                          <dd className="font-bold">{formatDurationMinutes(totalMinutes)}</dd>
                        </div>
                      </dl>
                    </section>

                    {shouldShowTechnicianSection && (
                      <section className="rounded-lg border border-border bg-muted/20 p-3">
                        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                          Atendimento técnico
                        </h3>
                        <div className="space-y-2">
                          {technicianRows.length > 0 ? (
                            technicianRows.map((row) => (
                              <div
                                key={row.id}
                                className="rounded border border-border bg-card p-2 text-sm"
                              >
                                <div className="font-semibold">{row.technicianName}</div>
                                <div>Início: {formatDateTime(row.startedAt)}</div>
                                <div>Fim: {formatDateTime(row.endedAt)}</div>
                                <div>
                                  Tempo:{" "}
                                  {row.minutes > 0 ? formatDurationMinutes(row.minutes) : "—"}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Sem manutentor apontado
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    <section className="rounded-lg border border-border bg-muted/30 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        Impacto operacional
                      </h3>
                      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-2">
                          <dt>Parada produtiva</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(impactBreakdown.productiveDowntimeSeconds)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Em falha sem produção programada</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(impactBreakdown.nonScheduledDowntimeSeconds)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Atendimento sem impacto produtivo</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(
                              impactBreakdown.productionBlockedSupportSeconds,
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Atendimento fora de produção</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(impactBreakdown.nonScheduledSupportSeconds)}
                          </dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {orphanFailureEvents.length > 0 && (
        <section className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3 md:p-4">
          <div className="flex items-start gap-2">
            <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <h2 className="font-black uppercase tracking-wider text-foreground">
                Ocorrências de falha sem chamado vinculado
              </h2>
              <p className="text-sm text-muted-foreground">
                Registros legados ou sem vínculo disponível permanecem acessíveis para consulta e
                edição.
              </p>
            </div>
          </div>
          <div className="space-y-2">{orphanFailureEvents.map(renderFailureEvent)}</div>
        </section>
      )}
    </div>
  );
}
