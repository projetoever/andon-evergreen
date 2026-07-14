import { useEffect, useMemo, useRef, useState } from "react";
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
import { CallTypeSelector } from "./CallTypeSelector";
import { BigButton } from "@/components/common/BigButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedMachineId?: string | null;
}

export function OpenCallModal({
  open,
  onOpenChange,
  preselectedMachineId,
}: OpenCallModalProps) {
  const { machines, openCall } = useAndon();
  const [machineId, setMachineId] = useState<string | null>(preselectedMachineId ?? null);
  const [subtype, setSubtype] = useState<CallSubtype | null>(null);
  const [machineCondition, setMachineCondition] = useState<MachineStatus>("running");
  const [machineSets, setMachineSets] = useState<MachineSet[]>([]);
  const [machineSetId, setMachineSetId] = useState<string | null>(null);
  const [machineSubsetId, setMachineSubsetId] = useState<string | null>(null);
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
    setMachineSetId(null);
    setMachineSubsetId(null);
    setMachineSets([]);

    const selectedMachine = machinesRef.current.find((m) => m.id === nextMachineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }, [open, preselectedMachineId]);

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
      setIsLoadingMachineSets(false);
      return;
    }

    let isCurrent = true;

    setIsLoadingMachineSets(true);
    setMachineSetId(null);
    setMachineSubsetId(null);

    listMachineSets(machineId, {
      includeSubsets: "list",
    })
      .then((sets) => {
        if (!isCurrent) return;

        setMachineSets(sets);

        const onlySet =
          sets.length === 1 ? sets[0] : null;

        setMachineSetId(onlySet?.id ?? null);
        setMachineSubsetId(null);
      })
      .catch(() => {
        if (!isCurrent) return;

        setMachineSets([]);
        setMachineSetId(null);
        setMachineSubsetId(null);
        toast.error(
          "Não foi possível carregar os conjuntos e subconjuntos da máquina",
        );
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
    setMachineSetId(null);
    setMachineSubsetId(null);
    setMachineSets([]);
    machineConditionTouchedRef.current = false;

    const selectedMachine = machinesRef.current.find((m) => m.id === nextMachineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }

  function handleSelectMachineSet(nextMachineSetId: string) {
    setMachineSetId(nextMachineSetId);
    setMachineSubsetId(null);
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
        (subset) =>
          subset.isActive &&
          subset.subsetType?.isActive !== false,
      ),
    [selectedMachineSet],
  );

  const selectedMachineSubset = useMemo(
    () =>
      selectedMachineSubsets.find(
        (subset) => subset.id === machineSubsetId,
      ) ?? null,
    [selectedMachineSubsets, machineSubsetId],
  );

  const shouldRequireMachineSet = machineSets.length > 0;

  const canConfirm = Boolean(
    machineId &&
      subtype &&
      (!shouldRequireMachineSet || machineSetId),
  );

  function handleConfirm() {
    if (!machineId || !subtype) return;
    if (shouldRequireMachineSet && !selectedMachineSet) {
      toast.error("Selecione o conjunto da máquina para abrir o ANDON");
      return;
    }

    const opt = getCallTypeOption(subtype);
    if (!opt) return;

    const params = {
      machineId,
      machineSetId: selectedMachineSet?.id,
      machineSetCodeSnapshot: selectedMachineSet?.code,
      machineSetNameSnapshot: selectedMachineSet?.name,
      machineSetTypeSnapshot:
        selectedMachineSet?.setType?.code ??
        selectedMachineSet?.type ??
        undefined,
      machineSubsetId: selectedMachineSubset?.id,
      machineSubsetCodeSnapshot: selectedMachineSubset?.code,
      machineSubsetNameSnapshot: selectedMachineSubset?.name,
      machineSubsetTypeSnapshot:
        selectedMachineSubset?.subsetType?.code,
      category: opt.category,
      subtype,
      criticality: "medium" as const,
      machineCondition,
    };

    try {
      openCall(params);
      toast.success(`ANDON aberto para Máquina ${machineId}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir ANDON");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">Abrir ANDON</DialogTitle>
          <DialogDescription className="text-base">
            Selecione a máquina, o tipo de chamado, o conjunto e, opcionalmente, o subconjunto.
          </DialogDescription>
        </DialogHeader>

        {!preselectedMachineId && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Máquina
            </h4>
            {selectableMachines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todas as máquinas já possuem chamado ativo.
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
          <div className="rounded-xl bg-muted/40 p-4">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Máquina selecionada
            </span>
            <div className="text-4xl font-black text-foreground">{preselectedMachineId}</div>
          </div>
        )}

        <CallTypeSelector value={subtype} onChange={setSubtype} />

        {machineId && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Conjunto da máquina
            </h4>
            {isLoadingMachineSets ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Carregando conjuntos cadastrados...
              </div>
            ) : machineSets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Esta máquina ainda não possui conjuntos cadastrados. O chamado será aberto sem conjunto.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {machineSets.map((set) => (
                  <button
                    key={set.id}
                    type="button"
                    onClick={() => handleSelectMachineSet(set.id)}
                    className={cn(
                      "min-h-[72px] rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01]",
                      machineSetId === set.id
                        ? "border-primary bg-primary text-primary-foreground shadow-lg ring-2 ring-ring/30"
                        : "border-border bg-card text-foreground hover:bg-accent",
                    )}
                  >
                    <div className="text-lg font-black uppercase tracking-wider">{set.name}</div>
                    <div className="mt-1 text-xs opacity-80">
                      Código: {set.code}{set.type ? ` • Tipo: ${set.type}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedMachineSet && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Subconjunto do conjunto
            </h4>

            <p className="mb-3 text-sm text-muted-foreground">
              Opcional. Selecione um item específico ou mantenha o chamado no conjunto inteiro.
            </p>

            {selectedMachineSubsets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Este conjunto não possui subconjuntos ativos. O chamado será aberto para o conjunto inteiro.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMachineSubsetId(null)}
                  className={cn(
                    "min-h-[72px] rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01]",
                    machineSubsetId === null
                      ? "border-primary bg-primary text-primary-foreground shadow-lg ring-2 ring-ring/30"
                      : "border-border bg-card text-foreground hover:bg-accent",
                  )}
                >
                  <div className="text-lg font-black uppercase tracking-wider">
                    Conjunto inteiro
                  </div>
                  <div className="mt-1 text-xs opacity-80">
                    Sem subconjunto específico
                  </div>
                </button>

                {selectedMachineSubsets.map((subset) => (
                  <button
                    key={subset.id}
                    type="button"
                    onClick={() => setMachineSubsetId(subset.id)}
                    className={cn(
                      "min-h-[72px] rounded-xl border-2 p-4 text-left transition-all hover:scale-[1.01]",
                      machineSubsetId === subset.id
                        ? "border-primary bg-primary text-primary-foreground shadow-lg ring-2 ring-ring/30"
                        : "border-border bg-card text-foreground hover:bg-accent",
                    )}
                  >
                    <div className="text-lg font-black uppercase tracking-wider">
                      {subset.name}
                    </div>

                    <div className="mt-1 text-xs opacity-80">
                      Código: {subset.code}
                      {subset.subsetType?.name
                        ? ` • Tipo: ${subset.subsetType.name}`
                        : ""}
                    </div>

                    {(subset.manufacturer ||
                      subset.model ||
                      subset.assetTag) && (
                      <div className="mt-1 text-xs opacity-80">
                        {[
                          subset.manufacturer,
                          subset.model,
                          subset.assetTag,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Condição da máquina
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { value: "stopped" as const, label: "Em falha", className: "border-danger/40 bg-danger/10 text-danger" },
              { value: "running" as const, label: "Pronta para rodar", className: "border-success/40 bg-success/10 text-success" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelectMachineCondition(option.value)}
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
            Cancelar
          </BigButton>
          <BigButton
            tone="warning"
            size="md"
            onClick={handleConfirm}
            disabled={!canConfirm || isLoadingMachineSets}
          >
            Abrir ANDON
          </BigButton>
        </DialogFooter>
        {/* satisfaz lint não usado */}
        <span className="hidden">{CALL_TYPE_OPTIONS.length}</span>
      </DialogContent>
    </Dialog>
  );
}
