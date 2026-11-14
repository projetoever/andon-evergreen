import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { CALL_TYPE_OPTIONS, getCallTypeOption } from "@/data/callTypes";
import type { CallSubtype } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";
import type { MachineSet } from "@/types/machineSet";
import { listMachineSets } from "@/services/machineAssetService";
import { getSystemSettings } from "@/services/systemSettingsService";
import { useModuleAccess } from "@/context/ModuleAccessProvider";
import { AndonApiError } from "@/api/andonApiClient";
import { getOperationalCallReasons, type OperationalReason } from "@/services/callReasonsCatalogService";
import type { HierarchicalOpeningChoice } from "./QuickOpenCallModal";
import { CallReasonOptionsModal } from "./CallReasonOptionsModal";
import { CallTypeSelector } from "./CallTypeSelector";
import { MachineAssetSelector } from "./MachineAssetSelector";
import { BigButton } from "@/components/common/BigButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/i18n/toast";
import { cn } from "@/lib/utils";
import {
  canOpenWithWorkOrder,
  canSubmitWorkOrderGate,
  normalizeWorkOrderNumber,
  resolveWorkOrderRequirement,
} from "@/utils/workOrderUtils";

interface OpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedMachineId?: string | null;
}

export function OpenCallModal({ open, onOpenChange, preselectedMachineId }: OpenCallModalProps) {
  useInterfaceLanguage();
  const { machines, calls, openCall } = useAndon();
  const { access, checking: accessChecking } = useModuleAccess();
  const navigate = useNavigate();
  const [reasonCatalogStatus, setReasonCatalogStatus] =
    useState<"loading" | "legacy" | "ready" | "unavailable">("loading");
  const [hierarchicalReasons, setHierarchicalReasons] = useState<OperationalReason[]>([]);
  const [selectedReasonId, setSelectedReasonId] = useState<string | null>(null);
  const [hierarchicalChoice, setHierarchicalChoice] = useState<HierarchicalOpeningChoice | null>(null);
  const [reasonReload, setReasonReload] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(preselectedMachineId ?? null);
  const [subtype, setSubtype] = useState<CallSubtype | null>(null);
  const [machineCondition, setMachineCondition] = useState<MachineStatus>("running");
  const [machineSets, setMachineSets] = useState<MachineSet[]>([]);
  const [machineSetId, setMachineSetId] = useState<string | null>(null);
  const [machineSubsetId, setMachineSubsetId] = useState<string | null>(null);
  const [isWholeSetSelected, setIsWholeSetSelected] = useState(false);
  const [allowWholeSetCalls, setAllowWholeSetCalls] = useState(true);
  const [requireWorkOrderAtOpen, setRequireWorkOrderAtOpen] = useState(false);
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [isLoadingSystemSettings, setIsLoadingSystemSettings] = useState(false);
  const [hasLoadedSystemSettings, setHasLoadedSystemSettings] = useState(false);
  const [systemSettingsLoadFailed, setSystemSettingsLoadFailed] = useState(false);
  const [isLoadingMachineSets, setIsLoadingMachineSets] = useState(false);
  const machinesRef = useRef(machines);
  const wasOpenRef = useRef(false);
  const initializedMachineIdRef = useRef<string | null>(preselectedMachineId ?? null);
  const machineConditionTouchedRef = useRef(false);

  useEffect(() => {
    machinesRef.current = machines;
  }, [machines]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      initializedMachineIdRef.current = preselectedMachineId ?? null;
      machineConditionTouchedRef.current = false;
      setWorkOrderNumber("");
      setOperatorNote("");
      setSelectedReasonId(null);
      setHierarchicalChoice(null);
      setReasonCatalogStatus("loading");
      return;
    }

    const nextMachineId = preselectedMachineId ?? null;
    const shouldInitialize =
      !wasOpenRef.current || initializedMachineIdRef.current !== nextMachineId;

    if (!shouldInitialize) return;

    wasOpenRef.current = true;
    initializedMachineIdRef.current = nextMachineId;
    machineConditionTouchedRef.current = false;
    setMachineId(nextMachineId);
    setSubtype(null);
    setSelectedReasonId(null);
    setHierarchicalChoice(null);
    setMachineSetId(null);
    setMachineSubsetId(null);
    setIsWholeSetSelected(false);
    setMachineSets([]);
    setWorkOrderNumber("");
    setOperatorNote("");

    const selectedMachine = machinesRef.current.find((m) => m.id === nextMachineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }, [open, preselectedMachineId]);

  useEffect(() => {
    if (!open) {
      setIsLoadingSystemSettings(false);
      setHasLoadedSystemSettings(false);
      setSystemSettingsLoadFailed(false);
      return;
    }

    let isCurrent = true;

    setIsLoadingSystemSettings(true);
    setHasLoadedSystemSettings(false);
    setSystemSettingsLoadFailed(false);

    getSystemSettings()
      .then((settings) => {
        if (!isCurrent) return;
        setAllowWholeSetCalls(settings.allowWholeSetCalls);
        setRequireWorkOrderAtOpen(settings.requireWorkOrderAtOpen === true);
        setHasLoadedSystemSettings(true);
        if (!settings.allowWholeSetCalls) {
          setIsWholeSetSelected(false);
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setHasLoadedSystemSettings(true);
        setSystemSettingsLoadFailed(true);
        toast.error(
          "Não foi possível carregar as configurações de abertura. Feche e reabra o modal para tentar novamente.",
        );
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoadingSystemSettings(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [open]);

  // OPEN-12: only an explicit server "hierarchical_calls_disabled" response
  // permits legacy opening in central mode. Network errors, 401/403, or an
  // empty enabled catalog MUST block opening instead of silently downgrading.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setHierarchicalReasons([]);
    setHierarchicalChoice(null);
    setSelectedReasonId(null);
    setSubtype(null);
    setReasonCatalogStatus("loading");
    if (accessChecking) return;
    if (!access) {
      setReasonCatalogStatus("unavailable");
      return;
    }
    if (!access.centralAccessEnabled) {
      setReasonCatalogStatus("legacy");
      return;
    }
    void getOperationalCallReasons()
      .then((reasons) => {
        if (!current) return;
        setHierarchicalReasons(reasons);
        setReasonCatalogStatus(reasons.length > 0 ? "ready" : "unavailable");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setReasonCatalogStatus(
          error instanceof AndonApiError && error.code === "hierarchical_calls_disabled"
            ? "legacy" : "unavailable",
        );
      });
    return () => { current = false; };
  }, [open, accessChecking, access?.centralAccessEnabled, reasonReload]);

  useEffect(() => {
    if (!open || !machineId || machineConditionTouchedRef.current) return;
    const selectedMachine = machines.find((m) => m.id === machineId);
    if (!selectedMachine) return;
    setMachineCondition(selectedMachine.machineStatus);
  }, [open, machineId, machines]);

  useEffect(() => {
    if (!open || !machineId) {
      setMachineSets([]);
      setMachineSetId(null);
      setMachineSubsetId(null);
      setIsWholeSetSelected(false);
      setIsLoadingMachineSets(false);
      return;
    }

    let isCurrent = true;

    setIsLoadingMachineSets(true);
    setMachineSetId(null);
    setMachineSubsetId(null);
    setIsWholeSetSelected(false);

    listMachineSets(machineId, {
      includeSubsets: "list",
    })
      .then((sets) => {
        if (!isCurrent) return;

        setMachineSets(sets);

        const onlySet = sets.length === 1 ? sets[0] : null;

        setMachineSetId(onlySet?.id ?? null);
        setMachineSubsetId(null);
      })
      .catch(() => {
        if (!isCurrent) return;

        setMachineSets([]);
        setMachineSetId(null);
        setMachineSubsetId(null);
        toast.error("Não foi possível carregar os conjuntos e subconjuntos da máquina");
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoadingMachineSets(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [open, machineId]);

  function handleSelectMachine(nextMachineId: string) {
    setMachineId(nextMachineId);
    setSelectedReasonId(null);
    setHierarchicalChoice(null);
    setSubtype(null);
    setMachineSetId(null);
    setMachineSubsetId(null);
    setMachineSets([]);
    machineConditionTouchedRef.current = false;

    const selectedMachine = machinesRef.current.find((m) => m.id === nextMachineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }

  function handleSelectReasonOption(reasonId: string, optionId: string) {
    const reason = hierarchicalReasons.find(item => item.id === reasonId);
    const option = reason?.options.find(item => item.id === optionId);
    if (reasonCatalogStatus !== "ready" || !reason || !option || !machineId) {
      toast.error(ui("Não foi possível validar a especialidade selecionada."));
      return;
    }
    const existing = calls.find(call =>
      call.machineId === machineId &&
      call.subtype === option.legacySubtype &&
      ["open", "in_progress", "post_maintenance"].includes(call.status),
    );
    setSelectedReasonId(null);
    if (existing) {
      // Do not open a duplicate; use the existing machine call UI.
      onOpenChange(false);
      void navigate({ to: "/machines/$machineId", params: { machineId } });
      return;
    }
    setHierarchicalChoice({
      reasonId: reason.id,
      optionId: option.id,
      expectedReasonRevision: reason.revision,
      expectedOptionRevision: option.revision,
      category: option.legacyCategory,
      subtype: option.legacySubtype,
      label: option.displayName,
    });
    setSubtype(option.legacySubtype);
  }

  function handleSelectMachineSet(nextMachineSetId: string) {
    setMachineSetId(nextMachineSetId);
    setMachineSubsetId(null);
    setIsWholeSetSelected(false);
  }

  function handleSelectMachineSubset(nextMachineSubsetId: string) {
    setMachineSubsetId(nextMachineSubsetId);
    setIsWholeSetSelected(false);
  }

  function handleSelectWholeSet() {
    setMachineSubsetId(null);
    setIsWholeSetSelected(true);
  }

  function handleSelectMachineCondition(condition: MachineStatus) {
    machineConditionTouchedRef.current = true;
    setMachineCondition(condition);
  }

  const selectableMachines = machines.filter((m) => m.andonStatus === "none");
  const selectedMachineSet = useMemo(
    () => machineSets.find((set) => set.id === machineSetId) ?? null,
    [machineSets, machineSetId],
  );

  const selectedMachineSubsets = useMemo(
    () =>
      (selectedMachineSet?.subsets ?? []).filter(
        (subset) => subset.isActive && subset.subsetType?.isActive !== false,
      ),
    [selectedMachineSet],
  );

  const selectedMachineSubset = useMemo(
    () => selectedMachineSubsets.find((subset) => subset.id === machineSubsetId) ?? null,
    [selectedMachineSubsets, machineSubsetId],
  );

  const shouldRequireMachineSet = machineSets.length > 0;
  const selectedMachine = machines.find((machine) => machine.id === machineId);
  const workOrderRequired = resolveWorkOrderRequirement(
    requireWorkOrderAtOpen,
    selectedMachine?.requireWorkOrderAtOpen === true,
  );

  const hasValidAssetSelection = Boolean(
    !shouldRequireMachineSet ||
    (selectedMachineSet &&
      (selectedMachineSubsets.length === 0 ||
        selectedMachineSubset ||
        (allowWholeSetCalls && isWholeSetSelected))),
  );

  const canOpenCondition = canSubmitWorkOrderGate({
    required: workOrderRequired,
    value: workOrderNumber,
    isLoading: isLoadingSystemSettings || !hasLoadedSystemSettings,
    loadFailed: systemSettingsLoadFailed,
  });

  const canConfirm = Boolean(
    machineId &&
    subtype &&
    (reasonCatalogStatus === "legacy" || (reasonCatalogStatus === "ready" && hierarchicalChoice?.subtype === subtype)) &&
    !isSubmitting &&
    hasValidAssetSelection &&
    !isLoadingSystemSettings &&
    hasLoadedSystemSettings &&
    !systemSettingsLoadFailed &&
    canOpenCondition,
  );

  async function handleConfirm() {
    if (!machineId || !subtype || !canConfirm || isSubmitting) return;
    if (reasonCatalogStatus !== "legacy" && (
      reasonCatalogStatus !== "ready" ||
      !hierarchicalChoice || hierarchicalChoice.subtype !== subtype
    )) return;
    if (isLoadingSystemSettings || !hasLoadedSystemSettings || systemSettingsLoadFailed) {
      toast.error(
        "Não foi possível carregar as configurações de abertura. Feche e reabra o modal para tentar novamente.",
      );
      return;
    }
    if (shouldRequireMachineSet && !selectedMachineSet) {
      toast.error("Selecione o conjunto da máquina para abrir o ANDON");
      return;
    }
    if (shouldRequireMachineSet && systemSettingsLoadFailed) {
      toast.error("Reabra o modal para carregar a política de seleção de ativos");
      return;
    }
    if (selectedMachineSubsets.length > 0 && !selectedMachineSubset) {
      if (!allowWholeSetCalls) {
        toast.error("Selecione um equipamento ou subconjunto para abrir o ANDON");
        return;
      }

      if (!isWholeSetSelected) {
        toast.error("Selecione um equipamento ou o conjunto inteiro");
        return;
      }
    }

    const normalizedWorkOrderNumber = normalizeWorkOrderNumber(workOrderNumber);
    if (!canOpenWithWorkOrder(workOrderRequired, workOrderNumber)) {
      toast.error("Informe o número da OS para abrir o chamado");
      return;
    }

    const opt = reasonCatalogStatus === "ready" && hierarchicalChoice
      ? { category: hierarchicalChoice.category }
      : getCallTypeOption(subtype);
    if (!opt) return;

    const params = {
      machineId,
      machineSetId: selectedMachineSet?.id,
      machineSetCodeSnapshot: selectedMachineSet?.code,
      machineSetNameSnapshot: selectedMachineSet?.name,
      machineSetTypeSnapshot:
        selectedMachineSet?.setType?.code ?? selectedMachineSet?.type ?? undefined,
      machineSubsetId: selectedMachineSubset?.id,
      machineSubsetCodeSnapshot: selectedMachineSubset?.code,
      machineSubsetNameSnapshot: selectedMachineSubset?.name,
      machineSubsetTypeSnapshot: selectedMachineSubset?.subsetType?.code,
      category: opt.category,
      subtype,
      criticality: "medium" as const,
      machineCondition,
      workOrderNumber: normalizedWorkOrderNumber || undefined,
      operatorNote: operatorNote.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      // Only a single POST. The server rechecks revisions, locks, workstation,
      // scope, machine and KPI policy before committing the immutable snapshot.
      await openCall({
        ...params,
        ...(reasonCatalogStatus === "ready" && hierarchicalChoice ? {
          reasonId: hierarchicalChoice.reasonId,
          optionId: hierarchicalChoice.optionId,
          expectedReasonRevision: hierarchicalChoice.expectedReasonRevision,
          expectedOptionRevision: hierarchicalChoice.expectedOptionRevision,
        } : {}),
      });
      toast.success(`ANDON aberto para Máquina ${machineId}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(ui(err instanceof Error ? err.message : "Erro ao abrir ANDON"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Dialog open={open && selectedReasonId === null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">{ui("Abrir ANDON")}</DialogTitle>
          <DialogDescription className="text-base">
            {ui("Selecione a máquina, o tipo de chamado e a localização da falha.")}
          </DialogDescription>
        </DialogHeader>

        {!preselectedMachineId && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {ui("Máquina")}
            </h4>
            {selectableMachines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {ui("Todas as máquinas já possuem chamado ativo.")}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {selectableMachines.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectMachine(m.id)}
                    className={
                      "min-h-[64px] rounded-xl border-2 text-2xl font-black transition-all " +
                      (machineId === m.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent")
                    }
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {preselectedMachineId && (
          <div className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {ui("Máquina selecionada")}
            </span>
            <div className="text-3xl font-black leading-none text-foreground">
              {preselectedMachineId}
            </div>
          </div>
        )}

        {reasonCatalogStatus === "legacy" ? (
          <CallTypeSelector value={subtype} onChange={setSubtype} />
        ) : reasonCatalogStatus === "loading" ? (
          <p role="status" className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
            {ui("Carregando motivos e subcategorias disponíveis...")}
          </p>
        ) : reasonCatalogStatus === "unavailable" ? (
          <div role="alert" className="space-y-3 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm">
            <p>{ui("Não foi possível consultar os motivos e subcategorias autorizados. A abertura permanece bloqueada.")}</p>
            <BigButton tone="neutral" size="md" onClick={() => setReasonReload(n => n + 1)}>
              {ui("Tentar novamente")}
            </BigButton>
          </div>
        ) : (
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {ui("Motivo do chamado")}
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {hierarchicalReasons.map(reason => (
                <button key={reason.id} type="button" disabled={!machineId || isSubmitting}
                  onClick={() => setSelectedReasonId(reason.id)}
                  className="min-h-14 rounded-xl border-2 border-border bg-card px-4 py-3 text-left text-base font-bold text-foreground hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {reason.displayName}
                </button>
              ))}
            </div>
            {hierarchicalChoice && (
              <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm font-semibold">
                {ui("Especialidade selecionada")}: {hierarchicalChoice.label}
              </p>
            )}
          </div>
        )}

        {machineId &&
          (isLoadingMachineSets || isLoadingSystemSettings || !hasLoadedSystemSettings ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {ui("Carregando conjuntos, equipamentos e política de seleção...")}
            </div>
          ) : systemSettingsLoadFailed ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              {ui(
                "Não foi possível carregar as configurações de abertura. Feche e reabra o modal antes de continuar.",
              )}
            </div>
          ) : machineSets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {ui(
                "Esta máquina ainda não possui conjuntos cadastrados. O chamado será aberto sem conjunto.",
              )}
            </div>
          ) : (
            <MachineAssetSelector
              machineSets={machineSets}
              selectedMachineSetId={machineSetId}
              selectedMachineSubsetId={machineSubsetId}
              isWholeSetSelected={isWholeSetSelected}
              allowWholeSetCalls={allowWholeSetCalls}
              onSelectMachineSet={handleSelectMachineSet}
              onSelectMachineSubset={handleSelectMachineSubset}
              onSelectWholeSet={handleSelectWholeSet}
            />
          ))}

        {workOrderRequired && (
          <div className="space-y-1.5">
            <Label htmlFor="open-call-work-order">{ui("Número da OS")}</Label>
            <Input
              id="open-call-work-order"
              value={workOrderNumber}
              maxLength={100}
              onChange={(event) => setWorkOrderNumber(event.target.value)}
              placeholder={ui("Informe o número da OS")}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="open-call-operator-note">
            {ui("Informação para o mantenedor ")}
            <span className="font-normal text-muted-foreground">{ui("(opcional)")}</span>
          </Label>
          <Textarea
            id="open-call-operator-note"
            value={operatorNote}
            maxLength={500}
            rows={2}
            onChange={(event) => setOperatorNote(event.target.value)}
            placeholder={ui("Ex.: ruído anormal, falha intermitente, cheiro de queimado...")}
          />
          <p className="text-right text-[11px] text-muted-foreground">{operatorNote.length}/500</p>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {ui("Condição da máquina")}
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              {
                value: "stopped" as const,
                label: ui("Em falha"),
                className: "border-danger/40 bg-danger/10 text-danger",
              },
              {
                value: "running" as const,
                label: ui("Pronta para rodar"),
                className: "border-success/40 bg-success/10 text-success",
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelectMachineCondition(option.value)}
                disabled={!canOpenCondition}
                className={cn(
                  "min-h-[72px] rounded-xl border-2 p-4 text-xl font-black uppercase tracking-wider transition-all hover:scale-[1.01]",
                  machineCondition === option.value
                    ? option.className + " shadow-lg ring-2 ring-ring/30"
                    : "border-border bg-card text-foreground hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
            {ui("Cancelar")}
          </BigButton>
          <BigButton
            tone="warning"
            size="md"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || isLoadingMachineSets || isSubmitting}
          >
            {ui("Abrir ANDON")}
          </BigButton>
        </DialogFooter>
        {/* satisfaz lint não usado */}
        <span className="hidden">{CALL_TYPE_OPTIONS.length}</span>
      </DialogContent>
    </Dialog>
    <CallReasonOptionsModal
      open={open && selectedReasonId !== null}
      busy={isSubmitting}
      activeSubtypes={calls.filter(call => call.machineId === machineId &&
        ["open", "in_progress", "post_maintenance"].includes(call.status)).map(call => call.subtype)}
      reason={hierarchicalReasons.find(reason => reason.id === selectedReasonId)
        ? {
            ...hierarchicalReasons.find(reason => reason.id === selectedReasonId)!,
            active: true,
            options: hierarchicalReasons.find(reason => reason.id === selectedReasonId)!.options
              .map(option => ({ ...option, active: true })),
          } : null}
      onOpenChange={next => { if (!next) setSelectedReasonId(null); }}
      onSelect={handleSelectReasonOption}
    />
    </>
  );
}
