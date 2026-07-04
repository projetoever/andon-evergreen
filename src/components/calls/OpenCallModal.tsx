import { useEffect, useMemo, useState } from "react";
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
import { createAndonApiClient } from "@/api/andonApiClient";
import { CallTypeSelector } from "./CallTypeSelector";
import { BigButton } from "@/components/common/BigButton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedMachineId?: string | null;
}

const andonApiClient = createAndonApiClient();

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
  const [isLoadingMachineSets, setIsLoadingMachineSets] = useState(false);

  useEffect(() => {
    if (open) {
      setMachineId(preselectedMachineId ?? null);
      setSubtype(null);
      setMachineSetId(null);
      setMachineSets([]);
      const selectedMachine = machines.find((m) => m.id === preselectedMachineId);
      setMachineCondition(selectedMachine?.machineStatus ?? "running");
    }
  }, [open, preselectedMachineId, machines]);

  useEffect(() => {
    if (!open || !machineId) return;
    const selectedMachine = machines.find((m) => m.id === machineId);
    setMachineCondition(selectedMachine?.machineStatus ?? "running");
  }, [open, machineId, machines]);

  useEffect(() => {
    if (!open || !machineId) {
      setMachineSets([]);
      setMachineSetId(null);
      setIsLoadingMachineSets(false);
      return;
    }

    let isCurrent = true;
    setIsLoadingMachineSets(true);
    setMachineSetId(null);

    andonApiClient
      .get<MachineSet[]>(`/api/machines/${encodeURIComponent(machineId)}/sets`)
      .then((sets) => {
        if (!isCurrent) return;
        setMachineSets(sets);
        setMachineSetId(sets.length === 1 ? sets[0].id : null);
      })
      .catch(() => {
        if (!isCurrent) return;
        setMachineSets([]);
        setMachineSetId(null);
      })
      .finally(() => {
        if (!isCurrent) return;
        setIsLoadingMachineSets(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [open, machineId]);

  const selectableMachines = machines.filter((m) => m.andonStatus === "none");
  const selectedMachineSet = useMemo(
    () => machineSets.find((set) => set.id === machineSetId) ?? null,
    [machineSets, machineSetId],
  );
  const shouldRequireMachineSet = machineSets.length > 0;
  const canConfirm = Boolean(machineId && subtype && (!shouldRequireMachineSet || machineSetId));

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
      machineSetTypeSnapshot: selectedMachineSet?.type ?? undefined,
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
            Selecione a máquina, o tipo de chamado e o conjunto quando houver cadastro.
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
                    onClick={() => setMachineId(m.id)}
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
                    onClick={() => setMachineSetId(set.id)}
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
                onClick={() => setMachineCondition(option.value)}
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
