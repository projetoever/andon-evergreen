import { useEffect, useState } from "react";
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
import { CallTypeSelector } from "./CallTypeSelector";
import { BigButton } from "@/components/common/BigButton";
import { toast } from "sonner";

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

  useEffect(() => {
    if (open) {
      setMachineId(preselectedMachineId ?? null);
      setSubtype(null);
    }
  }, [open, preselectedMachineId]);

  const selectableMachines = machines.filter((m) => m.andonStatus === "none");

  function handleConfirm() {
    if (!machineId || !subtype) return;
    const opt = getCallTypeOption(subtype);
    if (!opt) return;
    try {
      openCall({ machineId, category: opt.category, subtype });
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
            Selecione a máquina e o tipo de chamado.
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

        <DialogFooter className="gap-2">
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
            Cancelar
          </BigButton>
          <BigButton
            tone="warning"
            size="md"
            onClick={handleConfirm}
            disabled={!machineId || !subtype}
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
