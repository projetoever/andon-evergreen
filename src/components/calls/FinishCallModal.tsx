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
  DialogFooter,
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
import type {
  TechnicianArea,
} from "@/types/andon";
import type {
  MachineSet,
} from "@/types/machineSet";
import {
  requiresMaintenanceTechnician,
} from "@/utils/callTypeUtils";
import {
  getCallSubtypeLabel,
} from "@/utils/statusUtils";
import { toast } from "sonner";
import { TechnicianSelector } from "./TechnicianSelector";

interface FinishCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

const SUPPORT_AREAS: TechnicianArea[] = [
  "electrical",
  "mechanical",
  "hot_melt",
];

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

  const call = callId
    ? calls.find(
        (item) => item.id === callId,
      ) ?? null
    : null;

  const [
    technicianNames,
    setTechnicianNames,
  ] = useState<string[]>([]);

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
    assetConfirmed,
    setAssetConfirmed,
  ] = useState(false);

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

  const optionalTechnicianAreas =
    useMemo<TechnicianArea[]>(
      () =>
        option?.technicianArea
          ? SUPPORT_AREAS.filter(
              (area) =>
                area !==
                option.technicianArea,
            )
          : [],
      [option?.technicianArea],
    );

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

    const initialNames =
      activeSessionNames.length
        ? activeSessionNames
        : allSessionNames;

    setTechnicianNames(initialNames);
    setNotes("");

    setConfirmedMachineSetId(
      call.machineSetId ?? null,
    );

    setConfirmedMachineSubsetId(
      call.machineSubsetId ?? null,
    );


    setAssetConfirmed(false);
    setAssetChangeReason("");
    setIsSubmitting(false);
  }, [
    open,
    call?.id,
  ]);

  useEffect(() => {
    if (!open || !call) {
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
  ]);

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

  const preserveLegacySetSnapshot =
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

  const locationChanged = Boolean(
    call &&
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
      !isLoadingAssets &&
      !assetLoadFailed &&
      !isSubmitting &&
      assetConfirmed &&
      (
        !hasActiveSets ||
        selectedMachineSet
      ) &&
      (
        !requiresTechnician ||
        technicianNames.length > 0
      ),
  );

  if (!call) {
    return null;
  }

  const currentCall = call;

  function resolveSelectedTechnicians() {
    const configs = JSON.parse(
      localStorage.getItem(
        "andonTechniciansConfig",
      ) ?? "[]",
    ) as Array<{
      id?: string;
      name?: string;
      shiftId?: string;
      area?: TechnicianArea;
    }>;

    return technicianNames.map(
      (name) => {
        const config = configs.find(
          (item) =>
            item.name === name,
        );

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
            config?.id ??
            activeSession
              ?.technicianId ??
            anySession?.technicianId,

          shiftId:
            config?.shiftId ??
            activeSession?.shiftId ??
            anySession?.shiftId,

          shiftName:
            config?.shiftId ??
            activeSession?.shiftName ??
            anySession?.shiftName,

          technicalArea:
            config?.area ??
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

        assetConfirmed: true,

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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">
            Finalizar Chamado
          </DialogTitle>

          <DialogDescription className="text-base">
            Máquina{" "}
            {currentCall.machineId} ·{" "}
            {getCallSubtypeLabel(
              currentCall.subtype,
            )}
          </DialogDescription>
        </DialogHeader>

        {requiresTechnician &&
          option?.technicianArea && (
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Manutentores
              </h4>

              <TechnicianSelector
                area={
                  option.technicianArea
                }
                value={
                  technicianNames
                }
                onChange={
                  setTechnicianNames
                }
                optionalAreas={
                  optionalTechnicianAreas
                }
              />
            </div>
          )}

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Localização informada na abertura
          </h4>

          <p className="mt-2 text-lg font-black">
            {formatAssetLocation(
              currentCall
                .machineSetNameSnapshot,
              currentCall
                .machineSubsetNameSnapshot,
            )}
          </p>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Confirme o conjunto correto
          </h4>

          {isLoadingAssets ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Carregando conjuntos...
            </div>
          ) : assetLoadFailed ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              Não foi possível carregar
              os conjuntos. Feche e abra
              novamente.
            </div>
          ) : selectableMachineSets
              .length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Esta máquina não possui
              conjuntos cadastrados. A
              localização histórica será
              preservada.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {selectableMachineSets.map(
                (machineSet) => (
                  <button
                    key={
                      machineSet.id
                    }
                    type="button"
                    onClick={() => {
                      setConfirmedMachineSetId(
                        machineSet.id,
                      );

                      setConfirmedMachineSubsetId(
                        null,
                      );

                      setAssetConfirmed(
                        false,
                      );
                    }}
                    className={cn(
                      "min-h-[72px] rounded-xl border-2 p-4 text-left",
                      confirmedMachineSetId ===
                        machineSet.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    <div className="text-lg font-black">
                      {machineSet.name}
                    </div>

                    <div className="mt-1 text-xs opacity-80">
                      {machineSet.code}

                      {!machineSet.isActive
                        ? " • Inativo — localização da abertura"
                        : ""}
                    </div>
                  </button>
                ),
              )}
            </div>
          )}
        </div>

        {selectedMachineSet && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Confirme o subconjunto
            </h4>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmedMachineSubsetId(
                    null,
                  );

                  setAssetConfirmed(
                    false,
                  );
                }}
                className={cn(
                  "min-h-[72px] rounded-xl border-2 p-4 text-left",
                  confirmedMachineSubsetId ===
                    null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-accent",
                )}
              >
                <div className="text-lg font-black">
                  Conjunto inteiro
                </div>

                <div className="mt-1 text-xs opacity-80">
                  Sem subconjunto
                  específico
                </div>
              </button>

              {selectableMachineSubsets.map(
                (subset) => (
                  <button
                    key={subset.id}
                    type="button"
                    onClick={() => {
                      setConfirmedMachineSubsetId(
                        subset.id,
                      );

                      setAssetConfirmed(
                        false,
                      );
                    }}
                    className={cn(
                      "min-h-[72px] rounded-xl border-2 p-4 text-left",
                      confirmedMachineSubsetId ===
                        subset.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    <div className="text-lg font-black">
                      {subset.name}
                    </div>

                    <div className="mt-1 text-xs opacity-80">
                      {subset.code}

                      {!subset.isActive
                        ? " • Inativo — localização da abertura"
                        : ""}
                    </div>
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Localização confirmada
          </h4>

          <p className="mt-2 text-lg font-black">
            {formatAssetLocation(
              finalMachineSetName,
              finalMachineSubsetName,
            )}
          </p>

          {locationChanged && (
            <p className="mt-2 text-sm font-semibold text-warning">
              A localização foi corrigida
              em relação à abertura.
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">
            O responsável será registrado
            automaticamente com base nos
            atendimentos deste chamado.
          </p>
        </div>

        {locationChanged && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Justificativa da correção (opcional)
            </h4>

            <Textarea
              value={
                assetChangeReason
              }
              onChange={(event) =>
                setAssetChangeReason(
                  event.target.value,
                )
              }
              rows={3}
              placeholder="Explique a correção, se necessário. Em branco será registrado como Não justificado."
            />
          </div>
        )}


        <button
          type="button"
          onClick={() =>
            setAssetConfirmed(
              (current) => !current,
            )
          }
          disabled={
            isLoadingAssets ||
            assetLoadFailed ||
            (
              hasActiveSets &&
              !selectedMachineSet
            )
          }
          className={cn(
            "min-h-[64px] rounded-xl border-2 px-4 text-lg font-black disabled:opacity-50",
            assetConfirmed
              ? "border-success bg-success/10 text-success"
              : "border-border bg-card hover:bg-accent",
          )}
        >
          {assetConfirmed
            ? "Localização confirmada"
            : "Confirmar a localização acima"}
        </button>

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Observações (opcional)
          </h4>

          <Textarea
            value={notes}
            onChange={(event) =>
              setNotes(
                event.target.value,
              )
            }
            rows={3}
            placeholder="Descreva o atendimento, peças trocadas, etc."
          />
        </div>

        <DialogFooter className="gap-2">
          <BigButton
            tone="neutral"
            size="md"
            onClick={() =>
              onOpenChange(false)
            }
            disabled={
              isSubmitting
            }
          >
            Cancelar
          </BigButton>

          <BigButton
            tone="success"
            size="md"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={!canFinish}
          >
            {isSubmitting
              ? "Finalizando..."
              : "Finalizar chamado"}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}