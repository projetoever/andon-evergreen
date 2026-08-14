import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BigButton } from "@/components/common/BigButton";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { cn } from "@/lib/utils";
import {
  listMachineSets,
} from "@/services/machineAssetService";
import { getSystemSettings } from "@/services/systemSettingsService";
import type {
  MachineSet,
} from "@/types/machineSet";
import {
  requiresMaintenanceTechnician,
} from "@/utils/callTypeUtils";
import {
  getCallSubtypeLabel,
} from "@/utils/statusUtils";
import {
  calculateAttendanceMinutes,
  formatCompactDurationMinutes,
} from "@/utils/durationUtils";
import { useTicker } from "@/hooks/useTicker";
import {
  Check,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

interface FinishCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

function assetKey(
  id: string | null | undefined,
  code: string | null | undefined,
  name: string | null | undefined,
  type: string | null | undefined,
) {
  if (id) {
    return `id:${id}`;
  }

  const values = [
    code?.trim() ?? "",
    name?.trim() ?? "",
    type?.trim() ?? "",
  ];

  return values.some(Boolean)
    ? `snapshot:${values.join("|")}`
    : null;
}

function formatAssetLocation(
  setName: string | null | undefined,
  subsetName: string | null | undefined,
) {
  const values = [
    setName?.trim(),
    subsetName?.trim(),
  ].filter(
    (value): value is string =>
      Boolean(value),
  );

  return values.length
    ? values.join(" › ")
    : "Sem conjunto informado";
}

export function FinishCallModal({
  open,
  onOpenChange,
  callId,
}: FinishCallModalProps) {
  const {
    calls,
    finishCall,
  } = useAndon();

  useTicker(60_000);

  const call = callId
    ? calls.find(
        (item) => item.id === callId,
      ) ?? null
    : null;

  const [notes, setNotes] =
    useState("");

  const [
    machineSets,
    setMachineSets,
  ] = useState<MachineSet[]>([]);

  const [
    confirmedMachineSetId,
    setConfirmedMachineSetId,
  ] = useState<string | null>(null);

  const [
    confirmedMachineSubsetId,
    setConfirmedMachineSubsetId,
  ] = useState<string | null>(null);


  const [
    assetChangeReason,
    setAssetChangeReason,
  ] = useState("");

  const [
    isLoadingAssets,
    setIsLoadingAssets,
  ] = useState(false);

  const [
    assetLoadFailed,
    setAssetLoadFailed,
  ] = useState(false);

  const [
    allowWholeSetCalls,
    setAllowWholeSetCalls,
  ] = useState(false);

  const [
    isLoadingSystemSettings,
    setIsLoadingSystemSettings,
  ] = useState(false);

  const [
    systemSettingsLoadFailed,
    setSystemSettingsLoadFailed,
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const initializedCallIdRef =
    useRef<string | null>(null);

  const option = call
    ? getCallTypeOption(call.subtype)
    : null;

  const requiresTechnician = call
    ? requiresMaintenanceTechnician(call)
    : false;

  const requiresAssetConfirmation =
    call?.category === "maintenance";

  const activeSessionNames =
    useMemo(
      () =>
        Array.from(
          new Set(
            (
              call?.technicianSessions ??
              []
            )
              .filter(
                (session) =>
                  !session.endedAt,
              )
              .map(
                (session) =>
                  session.technicianName,
              ),
          ),
        ),
      [call?.technicianSessions],
    );

  const allSessionNames = useMemo(
    () =>
      Array.from(
        new Set(
          (
            call?.technicianSessions ??
            []
          ).map(
            (session) =>
              session.technicianName,
          ),
        ),
      ),
    [call?.technicianSessions],
  );

  const technicianNames = activeSessionNames.length
    ? activeSessionNames
    : allSessionNames.length
      ? allSessionNames
      : Array.from(new Set([...(call?.technicianNames ?? []), call?.technicianName].filter(Boolean))) as string[];

  useEffect(() => {
    if (!open) {
      initializedCallIdRef.current =
        null;

      return;
    }

    if (
      !call ||
      initializedCallIdRef.current ===
        call.id
    ) {
      return;
    }

    initializedCallIdRef.current =
      call.id;

    setNotes("");

    setConfirmedMachineSetId(
      call.machineSetId ?? null,
    );

    setConfirmedMachineSubsetId(
      call.machineSubsetId ?? null,
    );


    setAssetChangeReason("");
    setIsSubmitting(false);
  }, [
    open,
    call?.id,
  ]);

  useEffect(() => {
    if (!open || !call || !requiresAssetConfirmation) {
      setMachineSets([]);
      setIsLoadingAssets(false);
      setAssetLoadFailed(false);

      return;
    }

    let current = true;

    setIsLoadingAssets(true);
    setAssetLoadFailed(false);

    listMachineSets(call.machineId, {
      includeInactive: true,
      includeSubsets: "list",
    })
      .then((sets) => {
        if (current) {
          setMachineSets(sets);
        }
      })
      .catch(() => {
        if (!current) {
          return;
        }

        setMachineSets([]);
        setAssetLoadFailed(true);

        toast.error(
          "Não foi possível carregar os conjuntos da máquina",
        );
      })
      .finally(() => {
        if (current) {
          setIsLoadingAssets(false);
        }
      });

    return () => {
      current = false;
    };
  }, [
    open,
    callId,
    call?.machineId,
    requiresAssetConfirmation,
  ]);

  useEffect(() => {
    if (!open || !requiresAssetConfirmation) {
      setAllowWholeSetCalls(false);
      setIsLoadingSystemSettings(false);
      setSystemSettingsLoadFailed(false);

      return;
    }

    let current = true;

    setAllowWholeSetCalls(false);
    setIsLoadingSystemSettings(true);
    setSystemSettingsLoadFailed(false);

    getSystemSettings()
      .then((settings) => {
        if (current) {
          setAllowWholeSetCalls(settings.allowWholeSetCalls);
        }
      })
      .catch(() => {
        if (!current) {
          return;
        }

        setAllowWholeSetCalls(false);
        setSystemSettingsLoadFailed(true);

        toast.error(
          "Não foi possível carregar a política de seleção de ativos",
        );
      })
      .finally(() => {
        if (current) {
          setIsLoadingSystemSettings(false);
        }
      });

    return () => {
      current = false;
    };
  }, [open, requiresAssetConfirmation]);

  const selectableMachineSets =
    useMemo(
      () =>
        machineSets.filter(
          (machineSet) =>
            machineSet.isActive ||
            machineSet.id ===
              call?.machineSetId,
        ),
      [
        machineSets,
        call?.machineSetId,
      ],
    );

  const selectedMachineSet = useMemo(
    () =>
      selectableMachineSets.find(
        (machineSet) =>
          machineSet.id ===
          confirmedMachineSetId,
      ) ?? null,
    [
      selectableMachineSets,
      confirmedMachineSetId,
    ],
  );

  const selectableMachineSubsets =
    useMemo(
      () =>
        (
          selectedMachineSet?.subsets ??
          []
        ).filter(
          (subset) =>
            (
              subset.isActive &&
              subset.subsetType
                ?.isActive !== false
            ) ||
            subset.id ===
              call?.machineSubsetId,
        ),
      [
        selectedMachineSet,
        call?.machineSubsetId,
      ],
    );

  const selectedMachineSubset =
    useMemo(
      () =>
        selectableMachineSubsets.find(
          (subset) =>
            subset.id ===
            confirmedMachineSubsetId,
        ) ?? null,
      [
        selectableMachineSubsets,
        confirmedMachineSubsetId,
      ],
    );

  const hasActiveSets =
    selectableMachineSets.some(
      (machineSet) =>
        machineSet.isActive,
    );

  const hasValidAssetSelection = Boolean(
    !requiresAssetConfirmation ||
      (!hasActiveSets && !selectedMachineSet) ||
      (selectedMachineSet &&
        (selectableMachineSubsets.length === 0 ||
          selectedMachineSubset ||
          (allowWholeSetCalls &&
            !isLoadingSystemSettings &&
            !systemSettingsLoadFailed))),
  );

  const preserveLegacySetSnapshot =
    requiresAssetConfirmation &&
    !hasActiveSets &&
    !selectedMachineSet;

  const finalMachineSetId =
    selectedMachineSet?.id ?? null;

  const finalMachineSetCode =
    selectedMachineSet?.code ??
    (preserveLegacySetSnapshot
      ? call?.machineSetCodeSnapshot ??
        null
      : null);

  const finalMachineSetName =
    selectedMachineSet?.name ??
    (preserveLegacySetSnapshot
      ? call?.machineSetNameSnapshot ??
        null
      : null);

  const finalMachineSetType =
    selectedMachineSet?.setType?.code ??
    selectedMachineSet?.type ??
    (preserveLegacySetSnapshot
      ? call?.machineSetTypeSnapshot ??
        null
      : null);

  const preserveLegacySubsetSnapshot =
    preserveLegacySetSnapshot &&
    !selectedMachineSubset;

  const finalMachineSubsetId =
    selectedMachineSubset?.id ?? null;

  const finalMachineSubsetCode =
    selectedMachineSubset?.code ??
    (preserveLegacySubsetSnapshot
      ? call
          ?.machineSubsetCodeSnapshot ??
        null
      : null);

  const finalMachineSubsetName =
    selectedMachineSubset?.name ??
    (preserveLegacySubsetSnapshot
      ? call
          ?.machineSubsetNameSnapshot ??
        null
      : null);

  const finalMachineSubsetType =
    selectedMachineSubset
      ?.subsetType?.code ??
    (preserveLegacySubsetSnapshot
      ? call
          ?.machineSubsetTypeSnapshot ??
        null
      : null);

  const openingLocationExists = Boolean(
    requiresAssetConfirmation &&
      call &&
      (assetKey(
        call.machineSetId,
        call.machineSetCodeSnapshot,
        call.machineSetNameSnapshot,
        call.machineSetTypeSnapshot,
      ) ||
        assetKey(
          call.machineSubsetId,
          call.machineSubsetCodeSnapshot,
          call.machineSubsetNameSnapshot,
          call.machineSubsetTypeSnapshot,
        )),
  );

  const locationChanged = Boolean(
    call &&
      openingLocationExists &&
      (
        assetKey(
          call.machineSetId,
          call.machineSetCodeSnapshot,
          call.machineSetNameSnapshot,
          call.machineSetTypeSnapshot,
        ) !==
          assetKey(
            finalMachineSetId,
            finalMachineSetCode,
            finalMachineSetName,
            finalMachineSetType,
          ) ||
        assetKey(
          call.machineSubsetId,
          call.machineSubsetCodeSnapshot,
          call.machineSubsetNameSnapshot,
          call.machineSubsetTypeSnapshot,
        ) !==
          assetKey(
            finalMachineSubsetId,
            finalMachineSubsetCode,
            finalMachineSubsetName,
            finalMachineSubsetType,
          )
      ),
  );

  const canFinish = Boolean(
    call &&
      (!requiresAssetConfirmation ||
        (!isLoadingAssets &&
          !assetLoadFailed)) &&
      !isSubmitting &&
      hasValidAssetSelection &&
      (
        !requiresTechnician ||
        technicianNames.length > 0
      ),
  );

  if (!call) {
    return null;
  }

  const currentCall = call;

  const openingLocationLabel =
    formatAssetLocation(
      currentCall
        .machineSetNameSnapshot,
      currentCall
        .machineSubsetNameSnapshot,
    );

  const confirmedLocationLabel =
    formatAssetLocation(
      finalMachineSetName,
      finalMachineSubsetName,
    );

  const attendanceDurationLabel =
    formatCompactDurationMinutes(
      calculateAttendanceMinutes(
        currentCall,
      ),
      "menos de 1 min",
    );

  const technicianSummary =
    technicianNames.length > 0
      ? technicianNames.join(", ")
      : requiresTechnician
        ? "Mantenedor não selecionado"
        : "Sem mantenedor obrigatório";

  function resolveSelectedTechnicians() {
    return technicianNames.map(
      (name) => {
        const activeSession = (
          currentCall
            .technicianSessions ??
          []
        ).find(
          (session) =>
            !session.endedAt &&
            session.technicianName ===
              name,
        );

        const anySession = (
          currentCall
            .technicianSessions ??
          []
        ).find(
          (session) =>
            session.technicianName ===
            name,
        );

        return {
          name,

          id:
            activeSession
              ?.technicianId ??
            anySession?.technicianId,

          shiftId:
            activeSession?.shiftId ??
            anySession?.shiftId,

          shiftName:
            activeSession?.shiftName ??
            anySession?.shiftName,

          technicalArea:
            activeSession
              ?.technicalArea ??
            anySession
              ?.technicalArea ??
            option?.technicianArea ??
            undefined,
        };
      },
    );
  }

  async function handleConfirm() {
    if (!canFinish) {
      return;
    }

    setIsSubmitting(true);

    try {
      const selectedTechnicians =
        resolveSelectedTechnicians();

      await finishCall({
        callId: currentCall.id,

        technicianName:
          technicianNames[0] ?? null,

        technicianNames,

        technicianArea:
          selectedTechnicians[0]
            ?.technicalArea ??
          option?.technicianArea ??
          null,

        selectedTechnicians,

        notes:
          notes.trim() || null,

        confirmedMachineSetId:
          finalMachineSetId,

        confirmedMachineSetCodeSnapshot:
          finalMachineSetCode,

        confirmedMachineSetNameSnapshot:
          finalMachineSetName,

        confirmedMachineSetTypeSnapshot:
          finalMachineSetType,

        confirmedMachineSubsetId:
          finalMachineSubsetId,

        confirmedMachineSubsetCodeSnapshot:
          finalMachineSubsetCode,

        confirmedMachineSubsetNameSnapshot:
          finalMachineSubsetName,

        confirmedMachineSubsetTypeSnapshot:
          finalMachineSubsetType,


        assetChangeReason:
          locationChanged
            ? assetChangeReason.trim() || null
            : null,
      });

      toast.success(
        `Chamado da Máquina ${currentCall.machineId} finalizado`,
      );

      onOpenChange(false);
    }
    catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao finalizar chamado",
      );
    }
    finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent
        className={cn(
          "grid max-h-[92vh] w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0",
          requiresAssetConfirmation
            ? "max-w-5xl"
            : "max-w-2xl",
        )}
      >
        <DialogHeader className="border-b border-border px-4 py-4 pr-12 sm:px-5">
          <DialogTitle className="text-2xl sm:text-3xl">
            Finalizar chamado
          </DialogTitle>

          <DialogDescription className="flex flex-wrap items-center gap-2 pt-1 text-sm">
            <span className="rounded-lg bg-muted px-2.5 py-1 font-black text-foreground">
              Máquina {currentCall.machineId}
            </span>

            <span className="rounded-lg border border-border px-2.5 py-1 font-bold text-foreground">
              {getCallSubtypeLabel(currentCall.subtype)}
            </span>

            <span className="rounded-lg border border-info/30 bg-info/10 px-2.5 py-1 font-bold text-info">
              Atendimento: {attendanceDurationLabel}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto p-4 sm:p-5">
          {requiresTechnician && option?.technicianArea && (
            <section className="rounded-xl border border-border bg-muted/10 p-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mantenedores registrados no atendimento
              </h4>
              <p className="mt-1 text-sm font-bold text-foreground">
                {technicianNames.length ? technicianNames.join(", ") : "Nenhum mantenedor registrado"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A finalização usa somente as identificações realmente registradas nas sessões.
              </p>
            </section>
          )}

          {requiresAssetConfirmation && (
          <section className="rounded-2xl border border-border bg-muted/10 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Localização técnica final
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Selecione o conjunto e o equipamento identificados durante o atendimento.
                  </p>
                </div>
            </div>

            {openingLocationExists && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Informada na abertura
                  </p>
                  <p className="truncate text-base font-black" title={openingLocationLabel}>
                    {openingLocationLabel}
                  </p>
                </div>
              </div>
            </div>
            )}

            <div className="mt-4">
              <h5 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Conjunto
              </h5>

              {isLoadingAssets ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Carregando conjuntos...
                </div>
              ) : assetLoadFailed ? (
                <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
                  Não foi possível carregar os conjuntos. Feche e abra novamente.
                </div>
              ) : selectableMachineSets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Esta máquina não possui conjuntos cadastrados. A localização histórica será
                  preservada.
                </div>
              ) : (
                <div className="grid max-h-[220px] grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-3">
                  {selectableMachineSets.map((machineSet) => {
                    const selected = confirmedMachineSetId === machineSet.id;

                    return (
                      <button
                        key={machineSet.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setConfirmedMachineSetId(machineSet.id);
                          setConfirmedMachineSubsetId(null);
                        }}
                        className={cn(
                          "relative min-h-[60px] rounded-xl border-2 p-3 text-left transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                        )}
                      >
                        {selected && (
                          <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}

                        <div className="truncate pr-6 text-base font-black">{machineSet.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {machineSet.code}
                          {!machineSet.isActive ? " • Inativo — abertura" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedMachineSet && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Equipamento ou subconjunto
                  </h5>

                  {selectableMachineSubsets.length > 0 &&
                    (isLoadingSystemSettings ? (
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                        Verificando política
                      </span>
                    ) : !allowWholeSetCalls || systemSettingsLoadFailed ? (
                      <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-bold text-warning">
                        Equipamento obrigatório
                      </span>
                    ) : null)}
                </div>

                {selectableMachineSubsets.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
                    Este conjunto não possui equipamento cadastrado. A localização será confirmada
                    no próprio conjunto.
                  </div>
                ) : (
                  <>
                    {systemSettingsLoadFailed && (
                      <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                        Não foi possível validar a opção de conjunto inteiro. Selecione um
                        equipamento específico ou reabra o modal.
                      </p>
                    )}

                    <div className="grid max-h-[220px] grid-cols-2 gap-2 overflow-y-auto pr-1 md:grid-cols-3">
                      {allowWholeSetCalls &&
                        !isLoadingSystemSettings &&
                        !systemSettingsLoadFailed && (
                          <button
                            type="button"
                            aria-pressed={confirmedMachineSubsetId === null}
                            onClick={() => {
                              setConfirmedMachineSubsetId(null);
                            }}
                            className={cn(
                              "relative min-h-[60px] rounded-xl border-2 p-3 text-left transition-colors",
                              confirmedMachineSubsetId === null
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                            )}
                          >
                            {confirmedMachineSubsetId === null && (
                              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            )}

                            <div className="truncate pr-6 text-base font-black">
                              Conjunto inteiro
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Sem equipamento específico
                            </div>
                          </button>
                        )}

                      {selectableMachineSubsets.map((subset) => {
                        const selected = confirmedMachineSubsetId === subset.id;

                        return (
                          <button
                            key={subset.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setConfirmedMachineSubsetId(subset.id);
                            }}
                            className={cn(
                              "relative min-h-[60px] rounded-xl border-2 p-3 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                            )}
                          >
                            {selected && (
                              <span className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            )}

                            <div className="truncate pr-6 text-base font-black">{subset.name}</div>
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {subset.code}
                              {!subset.isActive ? " • Inativo — abertura" : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Localização selecionada
                </p>
                <p className="truncate text-base font-black" title={confirmedLocationLabel}>
                  {confirmedLocationLabel}
                </p>
                {locationChanged && (
                  <p className="mt-1 text-xs font-semibold text-warning">
                    {openingLocationLabel} → {confirmedLocationLabel}
                  </p>
                )}
              </div>
            </div>

            {locationChanged && (
              <div className="mt-4">
                <h5 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Justificativa da correção (opcional)
                </h5>

                <Textarea
                  value={assetChangeReason}
                  onChange={(event) => setAssetChangeReason(event.target.value)}
                  rows={2}
                  placeholder="Explique a correção, se necessário. Em branco será registrado como Não justificado."
                />
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">
              A localização e os responsáveis serão registrados automaticamente ao finalizar.
            </p>
          </section>
          )}

          <section>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Observações do atendimento (opcional)
            </h4>

            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder={
                requiresAssetConfirmation
                  ? "Descreva o atendimento, peças trocadas, ajustes ou orientações."
                  : "Registre uma observação sobre o atendimento, se necessário."
              }
            />
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Resumo da finalização
            </p>
            <p
              className="truncate text-sm font-bold text-foreground"
              title={
                requiresAssetConfirmation
                  ? `${technicianSummary} · ${confirmedLocationLabel}`
                  : "Produção / apoio · observação opcional"
              }
            >
              {requiresAssetConfirmation
                ? `${technicianSummary} · ${confirmedLocationLabel}`
                : "Produção / apoio · observação opcional"}
            </p>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            <BigButton
              tone="neutral"
              size="md"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </BigButton>

            <BigButton
              tone="success"
              size="md"
              className="w-full sm:w-auto"
              onClick={() => {
                void handleConfirm();
              }}
              disabled={!canFinish}
            >
              {isSubmitting ? "Finalizando..." : "Finalizar chamado"}
            </BigButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
