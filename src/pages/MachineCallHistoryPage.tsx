import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileWarning,
  History,
  Pencil,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "@/i18n/toast";

import { CallIdLabel } from "@/components/common/CallIdLabel";
import { EmptyState } from "@/components/common/EmptyState";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import { getFailureClassificationConfigs } from "@/services/failureClassificationConfigService";
import { DiagnosisAuditPanel } from "@/components/history/DiagnosisAuditPanel";
import type { FailureClassification, Machine, MachineStopEvent } from "@/types/machine";
import type { FailureClassificationConfig } from "@/types/settings";
import type { AndonCall } from "@/types/andon";
import { getCallFailureDetails, getCallSupplementalNotes } from "@/utils/callFailureDetailsUtils";
import {
  DEFAULT_CALL_HISTORY_FILTERS,
  filterCallHistory,
  hasActiveCallHistoryFilters,
  listCallHistoryTechnicians,
  type CallHistoryFilters,
} from "@/utils/callHistoryFilters";
import { isSpecificFailureClassification } from "@/utils/failureEventUtils";
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
import { getServerNow } from "@/utils/serverClock";
import { buildTechnicianTimeAllocations } from "@/utils/technicianTimeAllocationUtils";
import {
  buildTechnicianParticipationSummaries,
  getTechnicianAccumulatedMinutes,
} from "@/utils/technicianSessionUtils";
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
  return catalogByValue.get(value)?.label ?? ui("Classificação não cadastrada ({0})", { 0: value });
}

interface FailureEventCardProps {
  event: MachineStopEvent;
  machine: Machine;
  showFailureImpact: boolean;
  classifications: FailureClassificationConfig[];
  catalogByValue: Map<string, FailureClassificationConfig>;
  catalogLoading: boolean;
  catalogError: string | null;
  isEditing: boolean;
  editingText: string;
  editingPin: string;
  isSaving: boolean;
  editingClassification: FailureClassification;
  onStartEditing: (event: MachineStopEvent) => void;
  onEditingTextChange: (value: string) => void;
  onEditingPinChange: (value: string) => void;
  onEditingClassificationChange: (value: FailureClassification) => void;
  onCancelEditing: () => void;
  onSave: (event: MachineStopEvent) => void;
}

function FailureEventCard({
  event,
  machine,
  showFailureImpact,
  classifications,
  catalogByValue,
  catalogLoading,
  catalogError,
  isEditing,
  editingText,
  editingPin,
  isSaving,
  editingClassification,
  onStartEditing,
  onEditingTextChange,
  onEditingPinChange,
  onEditingClassificationChange,
  onCancelEditing,
  onSave,
}: FailureEventCardProps) {
  useInterfaceLanguage();
  const now = getServerNow();
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
          <dt className="text-xs uppercase text-muted-foreground">{ui("Início da falha")}</dt>
          <dd className="font-mono text-sm">{formatDateTime(event.stoppedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">{ui("Retorno da máquina")}</dt>
          <dd className="font-mono text-sm">
            {event.resumedAt ? formatDateTime(event.resumedAt) : ui("Em aberto")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-muted-foreground">{ui("Duração")}</dt>
          <dd className="font-bold">{formatDurationMinutes(duration)}</dd>
        </div>
        {showFailureImpact && (
          <div>
            <dt className="text-xs uppercase text-muted-foreground">{ui("Classificação")}</dt>
            <dd className="font-bold">
              {getFailureClassificationLabel(event.failureClassification, catalogByValue)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs uppercase text-muted-foreground">{ui("Status")}</dt>
          <dd className="font-bold">{event.resumedAt ? ui("Encerrada") : ui("Em aberto")}</dd>
        </div>
        {showFailureImpact && (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs uppercase text-muted-foreground">
              {ui("Descrição da ocorrência")}
            </dt>
            <dd className="text-foreground">
              {isEditing ? (
                <div className="mt-1 flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {ui("Classificação da ocorrência")}
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
                        {option.active ? "" : ui(" (Inativa)")}
                      </option>
                    ))}
                  </select>
                  {editingClassification === PLACEHOLDER_CLASSIFICATION && (
                    <p className="text-xs font-bold text-amber-500">
                      {ui("Selecione uma classificação específica para a ocorrência.")}
                    </p>
                  )}
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {ui("Descrição da ocorrência")}
                  </label>
                  <textarea
                    className="min-h-[88px] rounded-xl border border-border bg-background p-3 text-sm"
                    value={editingText}
                    onChange={(changeEvent) => onEditingTextChange(changeEvent.target.value)}
                  />
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {ui("PIN do mantenedor (obrigatório)")}
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={8}
                      value={editingPin}
                      onChange={(changeEvent) =>
                        onEditingPinChange(changeEvent.target.value.replace(/\D/g, ""))
                      }
                      placeholder={ui("4 a 8 números")}
                      disabled={isSaving}
                      className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onSave(event)}
                      className="inline-flex items-center gap-2 self-start rounded-xl bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground"
                      disabled={
                        isSaving ||
                        catalogLoading ||
                        Boolean(catalogError) ||
                        !/^\d{4,8}$/.test(editingPin)
                      }
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? ui("Salvando...") : ui("Salvar")}
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEditing}
                      disabled={isSaving}
                      className="inline-flex items-center gap-2 self-start rounded-xl border border-border px-3 py-2 text-xs font-bold uppercase tracking-wider"
                    >
                      {ui("Cancelar")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <span className="whitespace-pre-line">
                    {event.failureDescription || ui("Sem descrição")}
                  </span>
                  <button
                    type="button"
                    onClick={() => onStartEditing(event)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold uppercase tracking-wider"
                    disabled={catalogLoading || Boolean(catalogError)}
                  >
                    <Pencil className="h-4 w-4" />
                    {ui("Editar")}
                  </button>
                </div>
              )}
            </dd>
          </div>
        )}
      </dl>

      {showFailureImpact && <DiagnosisAuditPanel failureEventId={event.id} />}

      {showFailureImpact && (
        <section className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
          <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
            {ui("Impacto da falha")}
          </h4>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2">
              <dt>{ui("Impacto durante produção programada")}</dt>
              <dd className="font-bold">
                {formatBreakdownDuration(productionBreakdown.scheduledSeconds)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>{ui("Impacto fora de produção programada")}</dt>
              <dd className="font-bold">
                {formatBreakdownDuration(productionBreakdown.notScheduledSeconds)}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </article>
  );
}

export function MachineCallHistoryPage({ machineId }: MachineCallHistoryPageProps) {
  useInterfaceLanguage();
  const { machines, calls, updateMachineStopEventDescription, updateCallFailureDetails } =
    useAndon();
  const [expandedCallIds, setExpandedCallIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCallId, setEditingCallId] = useState<string | null>(null);
  const [savingCallDetails, setSavingCallDetails] = useState(false);
  const [savingFailure, setSavingFailure] = useState(false);
  const [editingPin, setEditingPin] = useState("");
  const [editingText, setEditingText] = useState("");
  const [editingClassification, setEditingClassification] = useState<FailureClassification>(
    PLACEHOLDER_CLASSIFICATION,
  );
  const [classifications, setClassifications] = useState<FailureClassificationConfig[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<CallHistoryFilters>({
    ...DEFAULT_CALL_HISTORY_FILTERS,
  });
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
        title={ui("Máquina não encontrada")}
        description={ui('A máquina "{0}" não existe.', { 0: machineId })}
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

  const failureDetailsByCallId = new Map(
    machineCalls.map((call) => {
      const details = getCallFailureDetails(call, failureEventsByCallId.get(call.id) ?? []);
      return [
        call.id,
        {
          classification: details.classification,
          description: details.description,
        },
      ] as const;
    }),
  );
  const filteredMachineCalls = filterCallHistory(
    machineCalls,
    historyFilters,
    failureDetailsByCallId,
    getServerNow(),
  );
  const technicianFilterOptions = listCallHistoryTechnicians(machineCalls);
  const subtypeFilterOptions = Array.from(
    new Map([
      ...CALL_TYPE_OPTIONS.map(
        (option) =>
          [
            option.id,
            {
              id: option.id,
              label: option.label,
              displayOrder: option.displayOrder,
            },
          ] as const,
      ),
      ...machineCalls.map(
        (call) =>
          [
            call.subtype,
            {
              id: call.subtype,
              label: getCallSubtypeLabel(call.subtype),
              displayOrder: 10_000,
            },
          ] as const,
      ),
    ]).values(),
  ).sort(
    (current, next) =>
      current.displayOrder - next.displayOrder ||
      current.label.localeCompare(next.label, "pt-BR", { sensitivity: "base" }),
  );
  const historyFiltersActive = hasActiveCallHistoryFilters(historyFilters);

  function setHistoryFilter<K extends keyof CallHistoryFilters>(
    key: K,
    value: CallHistoryFilters[K],
  ) {
    setHistoryFilters((current) => ({ ...current, [key]: value }));
  }

  const startEditingFailure = (event: MachineStopEvent) => {
    setEditingCallId(null);
    setEditingId(event.id);
    setEditingPin("");
    setEditingText(event.failureDescription || "");
    setEditingClassification(event.failureClassification ?? PLACEHOLDER_CLASSIFICATION);
  };

  const startEditingCall = (call: AndonCall, linkedEvents: MachineStopEvent[]) => {
    const details = getCallFailureDetails(call, linkedEvents);
    setEditingId(null);
    setEditingCallId(call.id);
    setEditingPin("");
    setEditingClassification(details.classification ?? PLACEHOLDER_CLASSIFICATION);
    setEditingText(details.description ?? "");
  };

  const saveCallDetails = async (call: AndonCall, linkedEvents: MachineStopEvent[]) => {
    const classification = editingClassification.trim();
    const description = editingText.trim();
    const catalogEntry = catalogByValue.get(classification);
    const currentClassification = getCallFailureDetails(call, linkedEvents).classification;
    if (
      !isSpecificFailureClassification(classification) ||
      !catalogEntry ||
      (!catalogEntry.active && currentClassification !== classification)
    ) {
      toast.error("Selecione uma classificação específica e válida.");
      return;
    }
    if (!description) {
      toast.error("Descrição da falha é obrigatória.");
      return;
    }
    if (!/^\d{4,8}$/.test(editingPin)) {
      toast.error("Informe o PIN do mantenedor (4 a 8 números).");
      return;
    }
    setSavingCallDetails(true);
    try {
      await updateCallFailureDetails({
        callId: call.id,
        failureClassification: classification,
        failureDescription: description,
        pin: editingPin,
      });
      setEditingCallId(null);
      toast.success("Diagnóstico do chamado atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar o diagnóstico.");
    } finally {
      setEditingPin("");
      setSavingCallDetails(false);
    }
  };

  const saveFailure = async (event: MachineStopEvent) => {
    if (editingClassification === PLACEHOLDER_CLASSIFICATION) {
      toast.error("Selecione uma classificação específica para a ocorrência.");
      return;
    }
    if (!/^\d{4,8}$/.test(editingPin)) {
      toast.error("Informe o PIN do mantenedor (4 a 8 números).");
      return;
    }
    setSavingFailure(true);
    try {
      await updateMachineStopEventDescription(
        machine.id,
        event.id,
        editingText.trim(),
        editingClassification,
        editingPin,
      );
      setEditingId(null);
      toast.success("Ocorrência atualizada com registro de auditoria.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar ocorrência.");
    } finally {
      setEditingPin("");
      setSavingFailure(false);
    }
  };

  const renderFailureEvent = (event: MachineStopEvent, showFailureImpact: boolean) => (
    <FailureEventCard
      key={event.id}
      event={event}
      machine={machine}
      showFailureImpact={showFailureImpact}
      classifications={classifications}
      catalogByValue={catalogByValue}
      catalogLoading={catalogLoading}
      catalogError={systemMessage(catalogError)}
      isEditing={editingId === event.id}
      editingText={editingText}
      editingPin={editingPin}
      isSaving={savingFailure}
      editingClassification={editingClassification}
      onStartEditing={startEditingFailure}
      onEditingTextChange={setEditingText}
      onEditingPinChange={setEditingPin}
      onEditingClassificationChange={setEditingClassification}
      onCancelEditing={() => setEditingId(null)}
      onSave={(event) => {
        void saveFailure(event);
      }}
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
            aria-label={ui("Voltar para a máquina")}
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {ui("Máquina ")}
              {machine.id}
            </div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">
              {ui("Histórico de Chamados")}
            </h1>
            <p className="text-sm text-muted-foreground">{machine.name}</p>
          </div>
        </div>
      </div>

      {catalogLoading && (
        <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {ui("Carregando catálogo central de classificações...")}
        </p>
      )}
      {catalogError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p className="font-bold">{ui("Catálogo central de classificações indisponível.")}</p>
          <p>{systemMessage(catalogError)}</p>
        </div>
      )}

      {machineCalls.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
                  {ui("Filtro e pesquisa")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {filteredMachineCalls.length}
                  {ui(" de ")}
                  {machineCalls.length}
                  {ui(" chamado(s)")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHistoryFilters({ ...DEFAULT_CALL_HISTORY_FILTERS })}
              disabled={!historyFiltersActive}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              {ui("Limpar filtros")}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Pesquisa rápida")}
              </span>
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={historyFilters.query}
                  onChange={(event) => setHistoryFilter("query", event.target.value)}
                  placeholder={ui("OS, ID, mantenedor, descrição...")}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                />
              </span>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Área / setor")}
              </span>
              <select
                value={historyFilters.subtype}
                onChange={(event) => setHistoryFilter("subtype", event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">{ui("Todas")}</option>
                {subtypeFilterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Período")}
              </span>
              <select
                value={historyFilters.period}
                onChange={(event) => {
                  const period = event.target.value as CallHistoryFilters["period"];
                  setHistoryFilters((current) => ({
                    ...current,
                    period,
                    customDate: period === "custom" ? current.customDate : "",
                  }));
                }}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">{ui("Todo o histórico")}</option>
                <option value="today">{ui("Hoje")}</option>
                <option value="7d">{ui("Últimos 7 dias")}</option>
                <option value="30d">{ui("Últimos 30 dias")}</option>
                <option value="custom">{ui("Dia específico")}</option>
              </select>
            </label>

            {historyFilters.period === "custom" && (
              <label>
                <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {ui("Dia da abertura")}
                </span>
                <input
                  type="date"
                  value={historyFilters.customDate}
                  onChange={(event) => setHistoryFilter("customDate", event.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                />
              </label>
            )}

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Status")}
              </span>
              <select
                value={historyFilters.status}
                onChange={(event) =>
                  setHistoryFilter("status", event.target.value as CallHistoryFilters["status"])
                }
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">{ui("Todos")}</option>
                <option value="open">{ui("Aberto")}</option>
                <option value="in_progress">{ui("Em atendimento")}</option>
                <option value="post_maintenance">{ui("Acompanhamento")}</option>
                <option value="finished">{ui("Finalizado")}</option>
                <option value="cancelled">{ui("Cancelado")}</option>
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Mantenedor")}
              </span>
              <select
                value={historyFilters.technician}
                onChange={(event) => setHistoryFilter("technician", event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">{ui("Todos")}</option>
                {technicianFilterOptions.map((technician) => (
                  <option key={technician} value={technician}>
                    {technician}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Classificação")}
              </span>
              <select
                value={historyFilters.failureClassification}
                onChange={(event) => setHistoryFilter("failureClassification", event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                disabled={catalogLoading || Boolean(catalogError)}
              >
                <option value="all">{ui("Todas")}</option>
                {classifications
                  .slice()
                  .sort((current, next) =>
                    current.label.localeCompare(next.label, "pt-BR", { sensitivity: "base" }),
                  )
                  .map((classification) => (
                    <option key={classification.id} value={classification.value}>
                      {classification.label}
                      {classification.active ? "" : ui(" (inativa)")}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {ui("Origem")}
              </span>
              <select
                value={historyFilters.origin}
                onChange={(event) =>
                  setHistoryFilter("origin", event.target.value as CallHistoryFilters["origin"])
                }
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="all">{ui("Todos")}</option>
                <option value="real">{ui("Chamados reais")}</option>
                <option value="system">{ui("Testes automáticos")}</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {machineCalls.length === 0 ? (
        <EmptyState
          icon={<History className="h-12 w-12" />}
          title={ui("Sem chamados registrados")}
          description={ui("Quando houver chamados para esta máquina, eles aparecerão aqui.")}
        />
      ) : filteredMachineCalls.length === 0 ? (
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title={ui("Nenhum chamado encontrado")}
          description={ui("Ajuste a pesquisa ou limpe os filtros para visualizar outros chamados.")}
        />
      ) : (
        <div className="space-y-2">
          {filteredMachineCalls.map((call) => {
            const now = getServerNow();
            const linkedFailureEvents = failureEventsByCallId.get(call.id) ?? [];
            const callFailureDetails = getCallFailureDetails(call, linkedFailureEvents);
            const supplementalNotes = getCallSupplementalNotes(
              call.notes,
              callFailureDetails.description,
            );
            const canEditDiagnosis = call.status === "finished" && !call.isSystemTest;
            const showFailureDiagnosis =
              canEditDiagnosis || Boolean(callFailureDetails.description);
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
                    ? ui("Sem mantenedor apontado")
                    : ui("Não aplicável");
            const effectiveAssetLocation = getEffectiveAssetLocationLabel(
              call,
              ui("Não informado"),
            );
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
            const finalizedAt = call.finishedAt ?? call.maintenanceCompletedAt ?? now.toISOString();
            const hasPhaseAwareSessions = sessions.some(
              (session) => session.phase === "maintenance" || session.phase === "follow_up",
            );
            const phaseAwareRows = hasPhaseAwareSessions
              ? buildTechnicianParticipationSummaries(sessions, finalizedAt, call.status).map(
                  (summary) => {
                    const intervals = [
                      ...summary.maintenanceIntervals,
                      ...summary.followUpIntervals,
                    ].sort((current, next) => current.startedAt.localeCompare(next.startedAt));
                    const firstInterval = intervals[0] ?? null;
                    const hasOpenInterval = intervals.some((interval) => !interval.endedAt);
                    const lastEndedInterval = intervals
                      .filter((interval) => Boolean(interval.endedAt))
                      .sort((current, next) =>
                        (next.endedAt ?? "").localeCompare(current.endedAt ?? ""),
                      )[0];

                    return {
                      id: summary.key,
                      technicianName: formatTechnicianDisplayName(summary.technicianName),
                      startedAt: firstInterval?.startedAt ?? null,
                      endedAt: hasOpenInterval ? null : (lastEndedInterval?.endedAt ?? null),
                      maintenanceMinutes: summary.maintenanceMinutes,
                      followUpMinutes: summary.followUpMinutes,
                      totalMinutes: getTechnicianAccumulatedMinutes(summary),
                      phaseAware: true,
                    };
                  },
                )
              : [];
            const legacyAllocationRows = buildTechnicianTimeAllocations({
              call,
              finalizedAt,
              technicianNames: finalTechnicianNames,
            }).map((allocation, index) => ({
              id:
                allocation.technicianId ??
                `${allocation.technicianName}-${allocation.source}-${index}`,
              technicianName: formatTechnicianDisplayName(allocation.technicianName),
              startedAt: allocation.startedAt ?? null,
              endedAt: allocation.endedAt ?? null,
              maintenanceMinutes: 0,
              followUpMinutes: 0,
              totalMinutes: typeof allocation.minutes === "number" ? allocation.minutes : 0,
              phaseAware: false,
            }));

            const hasLegacyUnassignedAttendance =
              isMaintenance &&
              Boolean(call.attendedAt) &&
              finalTechnicianNames.length === 0 &&
              sessions.length === 0;
            const legacyUnassignedAllocation = allocations.find(
              (allocation) => allocation.source === "unassigned_time",
            );
            const legacyRows =
              hasLegacyUnassignedAttendance && legacyUnassignedAllocation
                ? [
                    ...legacyAllocationRows,
                    {
                      id: `${call.id}-legacy-unassigned`,
                      technicianName: "Sem mantenedor apontado",
                      startedAt: legacyUnassignedAllocation.startedAt,
                      endedAt: legacyUnassignedAllocation.endedAt,
                      maintenanceMinutes: 0,
                      followUpMinutes: 0,
                      totalMinutes: legacyUnassignedAllocation.minutes,
                      phaseAware: false,
                    },
                  ]
                : legacyAllocationRows;
            const technicianRows = phaseAwareRows.length > 0 ? phaseAwareRows : legacyRows;

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
                      {call.category === "maintenance" ? ui("Manutenção") : ui("Produção")} •{" "}
                      {getCallSubtypeLabel(call.subtype)}
                    </h2>
                    <CallIdLabel callId={call.id} className="mt-0.5" />
                    {call.workOrderNumber && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {ui("OS:")}{" "}
                        <span className="font-bold text-foreground">{call.workOrderNumber}</span>
                      </div>
                    )}
                    {call.isSystemTest && (
                      <div className="mt-1 w-fit rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-warning">
                        {ui("Teste automático")}
                      </div>
                    )}
                    <div className="mt-1 w-fit max-w-full truncate rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {ui("Localização: ")}
                      {effectiveAssetLocation}
                    </div>
                    {call.assetLocationChanged && (
                      <div className="mt-1 w-fit rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-warning">
                        {ui("Corrigida na finalização")}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-muted-foreground">
                      {ui("Tempo total:")}{" "}
                      <span className="font-bold text-foreground">
                        {formatDurationMinutes(totalMinutes)}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {ui("Mantenedores: ")}
                      {technicianNames}
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
                      {isExpanded ? ui("Ocultar detalhes") : ui("Mais detalhes")}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                          {ui("Chamado")}
                        </h3>
                        {canEditDiagnosis && editingCallId !== call.id && (
                          <button
                            type="button"
                            onClick={() => startEditingCall(call, linkedFailureEvents)}
                            disabled={catalogLoading || Boolean(catalogError)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold uppercase tracking-wider"
                            aria-label={ui("Editar diagnóstico do chamado")}
                          >
                            <Pencil className="h-4 w-4" />
                            {ui(" Editar diagnóstico")}
                          </button>
                        )}
                      </div>
                      <dl className="grid grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="sm:col-span-2 lg:col-span-4">
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("ID do chamado")}
                          </dt>
                          <dd>
                            <CallIdLabel callId={call.id} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">{ui("Tipo")}</dt>
                          <dd className="font-bold">
                            {call.category === "maintenance" ? ui("Manutenção") : ui("Produção")} •{" "}
                            {getCallSubtypeLabel(call.subtype)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Status")}
                          </dt>
                          <dd className="font-bold">{getAndonStatusLabel(call.status)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Criticidade")}
                          </dt>
                          <dd className="font-bold">{getCriticalityLabel(call.criticality)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Localização")}
                          </dt>
                          <dd className="font-bold">{effectiveAssetLocation}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Condição ao abrir")}
                          </dt>
                          <dd className="font-bold">
                            {getMachineConditionLabel(call.machineCondition)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Área técnica")}
                          </dt>
                          <dd className="font-bold">
                            {getTechnicianAreaLabel(call.technicianArea)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Início do chamado")}
                          </dt>
                          <dd className="font-mono">{formatDateTime(call.openedAt)}</dd>
                        </div>
                        {call.operatorNote && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              {ui("Informação do operador na abertura")}
                            </dt>
                            <dd className="whitespace-pre-line font-semibold">
                              {call.operatorNote}
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Início da manutenção")}
                          </dt>
                          <dd className="font-mono">{formatDateTime(call.attendedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Conclusão da manutenção")}
                          </dt>
                          <dd className="font-mono">
                            {formatDateTime(call.maintenanceCompletedAt)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {call.status === "cancelled" ? ui("Cancelado em") : ui("Finalizado em")}
                          </dt>
                          <dd className="font-mono">{formatDateTime(call.finishedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase text-muted-foreground">
                            {ui("Retornos à manutenção")}
                          </dt>
                          <dd className="font-bold">{call.maintenanceReturnCount}</dd>
                        </div>
                        {!callFailureDetails.description && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              {ui("Descrição")}
                            </dt>
                            <dd className="whitespace-pre-line">
                              {call.notes || ui("Sem descrição")}
                            </dd>
                          </div>
                        )}
                        {showFailureDiagnosis && (
                          <>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <dt className="text-xs uppercase text-muted-foreground">
                                {ui("Classificação da falha")}
                              </dt>
                              <dd className="font-bold">
                                {callFailureDetails.classification
                                  ? getFailureClassificationLabel(
                                      callFailureDetails.classification,
                                      catalogByValue,
                                    )
                                  : ui("Não registrado")}
                              </dd>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-4">
                              <dt className="text-xs uppercase text-muted-foreground">
                                {ui("Descrição da falha")}
                              </dt>
                              <dd className="whitespace-pre-line">
                                {callFailureDetails.description ?? ui("Não registrado")}
                              </dd>
                            </div>
                          </>
                        )}
                        {callFailureDetails.description && supplementalNotes && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              {ui("Observações do chamado")}
                            </dt>
                            <dd className="whitespace-pre-line">{supplementalNotes}</dd>
                          </div>
                        )}
                        {call.assetLocationChanged && call.assetChangeReason && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              {ui("Justificativa da correção")}
                            </dt>
                            <dd className="whitespace-pre-line font-semibold text-warning">
                              {call.assetChangeReason}
                            </dd>
                          </div>
                        )}
                        {call.status === "cancelled" && call.cancelReason && (
                          <div className="sm:col-span-2 lg:col-span-4">
                            <dt className="text-xs uppercase text-muted-foreground">
                              {ui("Justificativa do cancelamento")}
                            </dt>
                            <dd className="whitespace-pre-line font-semibold">
                              {call.cancelReason}
                            </dd>
                          </div>
                        )}
                      </dl>
                      {canEditDiagnosis && editingCallId === call.id && (
                        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                          <label
                            htmlFor={`classification-${call.id}`}
                            className="text-xs font-bold uppercase text-muted-foreground"
                          >
                            {ui("Classificação da falha")}
                          </label>
                          <select
                            id={`classification-${call.id}`}
                            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
                            value={editingClassification}
                            onChange={(event) => setEditingClassification(event.target.value)}
                            disabled={savingCallDetails || catalogLoading || Boolean(catalogError)}
                          >
                            {!catalogByValue.has(editingClassification) && (
                              <option value={editingClassification}>
                                {ui("Selecione uma classificação")}
                              </option>
                            )}
                            {classifications
                              .filter(
                                (entry) => entry.active || entry.value === editingClassification,
                              )
                              .map((entry) => (
                                <option key={entry.id} value={entry.value}>
                                  {entry.label}
                                  {entry.active ? "" : ui(" (Inativa)")}
                                </option>
                              ))}
                          </select>
                          <label
                            htmlFor={`description-${call.id}`}
                            className="text-xs font-bold uppercase text-muted-foreground"
                          >
                            {ui("Descrição da falha")}
                          </label>
                          <textarea
                            id={`description-${call.id}`}
                            className="min-h-[88px] rounded-xl border border-border bg-background p-3 text-sm"
                            value={editingText}
                            onChange={(event) => setEditingText(event.target.value)}
                            disabled={savingCallDetails}
                          />
                          <label className="text-xs font-bold uppercase text-muted-foreground">
                            {ui("PIN do mantenedor (obrigatório)")}
                            <input
                              type="password"
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={8}
                              value={editingPin}
                              onChange={(event) =>
                                setEditingPin(event.target.value.replace(/\D/g, ""))
                              }
                              placeholder={ui("4 a 8 números")}
                              disabled={savingCallDetails}
                              className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm"
                            />
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveCallDetails(call, linkedFailureEvents)}
                              disabled={
                                savingCallDetails ||
                                catalogLoading ||
                                Boolean(catalogError) ||
                                !/^\d{4,8}$/.test(editingPin)
                              }
                              className="inline-flex items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-xs font-bold uppercase text-secondary-foreground"
                            >
                              <Save className="h-4 w-4" />{" "}
                              {savingCallDetails ? ui("Salvando...") : ui("Salvar")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCallId(null)}
                              disabled={savingCallDetails}
                              className="rounded-xl border border-border px-3 py-2 text-xs font-bold uppercase"
                            >
                              {ui("Cancelar")}
                            </button>
                          </div>
                        </div>
                      )}
                      {canEditDiagnosis && <DiagnosisAuditPanel callId={call.id} />}
                    </section>

                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {ui("Falha")}
                      </h3>
                      {linkedFailureEvents.length > 0 ? (
                        <div className="space-y-2">
                          {linkedFailureEvents.map((event) => renderFailureEvent(event, false))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {ui("Nenhuma ocorrência de falha vinculada a este chamado.")}
                        </p>
                      )}
                    </section>

                    <section className="rounded-lg border border-border bg-muted/20 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {ui("Tempos")}
                      </h3>
                      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <dt>{ui("Tempo de ANDON")}</dt>
                          <dd className="font-bold text-warning">
                            {formatDurationMinutes(waitingMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>{ui("Tempo de atendimento")}</dt>
                          <dd className="font-bold text-info">
                            {formatDurationMinutes(attendanceMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>{ui("Tempo de acompanhamento")}</dt>
                          <dd className="font-bold text-info">
                            {formatDurationMinutes(postMaintenanceMinutes)}
                          </dd>
                        </div>
                        <div>
                          <dt>{ui("Tempo total")}</dt>
                          <dd className="font-bold">{formatDurationMinutes(totalMinutes)}</dd>
                        </div>
                      </dl>
                    </section>

                    {shouldShowTechnicianSection && (
                      <section className="rounded-lg border border-border bg-muted/20 p-3">
                        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                          {ui("Atendimento técnico")}
                        </h3>
                        <div className="space-y-2">
                          {technicianRows.length > 0 ? (
                            technicianRows.map((row) => (
                              <div
                                key={row.id}
                                className="rounded-lg border border-border bg-card p-2.5 text-sm"
                              >
                                <div className="font-semibold">{row.technicianName}</div>
                                {row.phaseAware ? (
                                  <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-md border border-info/25 bg-info/10 p-2">
                                      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                        {ui("Atendimento")}
                                      </dt>
                                      <dd className="mt-0.5 font-mono font-black text-info">
                                        {formatDurationMinutes(row.maintenanceMinutes)}
                                      </dd>
                                    </div>
                                    <div className="rounded-md border border-success/25 bg-success/10 p-2">
                                      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                        {ui("Acompanhamento")}
                                      </dt>
                                      <dd className="mt-0.5 font-mono font-black text-success">
                                        {formatDurationMinutes(row.followUpMinutes)}
                                      </dd>
                                    </div>
                                    <div className="rounded-md border border-border bg-muted/20 p-2">
                                      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                        {ui("Total individual")}
                                      </dt>
                                      <dd className="mt-0.5 font-mono font-black text-foreground">
                                        {formatDurationMinutes(row.totalMinutes)}
                                      </dd>
                                    </div>
                                  </dl>
                                ) : (
                                  <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                                      {ui("Tempo total legado")}
                                    </div>
                                    <div className="mt-0.5 font-mono font-black text-foreground">
                                      {row.totalMinutes > 0
                                        ? formatDurationMinutes(row.totalMinutes)
                                        : "—"}
                                    </div>
                                  </div>
                                )}
                                <div className="mt-2 grid gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                                  <div>
                                    {ui("Primeiro início: ")}
                                    {formatDateTime(row.startedAt)}
                                  </div>
                                  <div>
                                    {ui("Último fim: ")}
                                    {formatDateTime(row.endedAt)}
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              {ui("Sem mantenedor apontado")}
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    <section className="rounded-lg border border-border bg-muted/30 p-3">
                      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
                        {ui("Impacto operacional")}
                      </h3>
                      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        <div className="flex items-center justify-between gap-2">
                          <dt>{ui("Parada produtiva")}</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(impactBreakdown.productiveDowntimeSeconds)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>{ui("Em falha sem produção programada")}</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(impactBreakdown.nonScheduledDowntimeSeconds)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>{ui("Atendimento sem impacto produtivo")}</dt>
                          <dd className="font-bold">
                            {formatBreakdownDuration(
                              impactBreakdown.productionBlockedSupportSeconds,
                            )}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>{ui("Atendimento fora de produção")}</dt>
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
                {ui("Ocorrências de falha sem chamado vinculado")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {ui(
                  "Registros legados ou sem vínculo disponível permanecem acessíveis para consulta e edição.",
                )}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {orphanFailureEvents.map((event) => renderFailureEvent(event, true))}
          </div>
        </section>
      )}
    </div>
  );
}
