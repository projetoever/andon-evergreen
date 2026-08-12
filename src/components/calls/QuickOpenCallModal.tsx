import { useState } from "react";
import { CheckCircle2, CircleStop, X } from "lucide-react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import type { CallSubtype } from "@/types/andon";
import type { MachineStatus } from "@/types/machine";

interface QuickOpenCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineId: string;
  subtypes: CallSubtype[];
  onSuccess: () => void;
}

export function QuickOpenCallModal({
  open,
  onOpenChange,
  machineId,
  subtypes,
  onSuccess,
}: QuickOpenCallModalProps) {
  const { openCalls } = useAndon();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCondition(machineCondition: MachineStatus) {
    if (!subtypes.length || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await openCalls(
        subtypes.map((subtype) => {
          const option = getCallTypeOption(subtype);
          if (!option) throw new Error("Tipo de chamado inválido");
          return {
            machineId,
            category: option.category,
            subtype,
            criticality: "medium" as const,
            machineCondition,
          };
        }),
      );
      toast.success(
        subtypes.length === 1
          ? `Chamado de ${getCallTypeOption(subtypes[0])?.label} aberto.`
          : `${subtypes.length} chamados abertos para a Máquina ${machineId}.`,
      );
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir os chamados");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl sm:text-3xl">A máquina está parada agora?</DialogTitle>
          <DialogDescription className="text-base">
            Informe a condição atual. A ocorrência pode ser registrada mesmo que não tenha causado a parada,
            como durante uma troca de receita.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Setores selecionados
          </p>
          <p className="mt-1 text-lg font-black">
            {subtypes.map((subtype) => getCallTypeOption(subtype)?.label ?? subtype).join(" + ")}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <BigButton
            tone="danger"
            size="lg"
            className="min-h-28 whitespace-normal px-4 text-center"
            onClick={() => void handleCondition("stopped")}
            disabled={isSubmitting}
          >
            <CircleStop className="h-8 w-8 shrink-0" />
            <span>Sim — está parada</span>
          </BigButton>
          <BigButton
            tone="success"
            size="lg"
            className="min-h-28 whitespace-normal px-4 text-center"
            onClick={() => void handleCondition("running")}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="h-8 w-8 shrink-0" />
            <span>Não — está operando</span>
          </BigButton>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-bold hover:bg-accent"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          <X className="h-4 w-4" /> Cancelar
        </button>
      </DialogContent>
    </Dialog>
  );
}
