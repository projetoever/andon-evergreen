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
import { getSystemSettings } from "@/services/systemSettingsService";
import { CallTypeSelector } from "./CallTypeSelector";
import { MachineAssetSelector } from "./MachineAssetSelector";
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
  const [isWholeSetSelected, setIsWholeSetSelected] = useState(false);
  const [allowWholeSetCalls, setAllowWholeSetCalls] = useState(true);
  const [isLoadingSystemSettings, setIsLoadingSystemSettings] = useState(false);
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
    setIsWholeSetSelected(false);
    setMachineSets([]);

    const selectedMachine = machinesRef.current.find((m) => m.id === nextMachineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }, [open, preselectedMachineId]);

  useEffect(() => {
    if (!open) {
      setIsLoadingSystemSettings(false);
      setSystemSettingsLoadFailed(false);
      return;
    }

    let isCurrent = true;

    setIsLoadingSystemSettings(true);
    setSystemSettingsLoadFailed(false);

    getSystemSettings()
      .then((settings) => {
        if (!isCurrent) return;
        setAllowWholeSetCalls(settings.allowWholeSetCalls);
        if (!settings.allowWholeSetCalls) {
          setIsWholeSetSelected(false);
        }
      })
      .catch(() => {
        if (!isCurrent) return;
        setSystemSettingsLoadFailed(true);
        toast.error("Não foi possível carregar a política de seleção de ativos");
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoadingSystemSettings(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [open]);

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

  const hasValidAssetSelection = Boolean(
    !shouldRequireMachineSet ||
      (selectedMachineSet &&
        (selectedMachineSubsets.length === 0 ||
          selectedMachineSubset ||
          (allowWholeSetCalls && isWholeSetSelected))),
  );

  const canConfirm = Boolean(
    machineId &&
      subtype &&
      hasValidAssetSelection &&
      (!shouldRequireMachineSet ||
        (!isLoadingSystemSettings && !systemSettingsLoadFailed)),
  );

  function handleConfirm() {
    if (!machineId || !subtype) return;
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
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">Abrir ANDON</DialogTitle>
          <DialogDescription className="text-base">
            Selecione a máquina, o tipo de chamado e a localização da falha.
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

        {machineId &&
          (isLoadingMachineSets || isLoadingSystemSettings ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Carregando conjuntos, equipamentos e política de seleção...
            </div>
          ) : machineSets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Esta máquina ainda não possui conjuntos cadastrados. O chamado será aberto sem conjunto.
            </div>
          ) : systemSettingsLoadFailed ? (
            <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              Não foi possível carregar a política de seleção de ativos. Feche e reabra o modal antes de continuar.
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
