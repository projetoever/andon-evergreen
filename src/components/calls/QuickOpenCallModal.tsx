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
  subtype: CallSubtype | null;
}

export function QuickOpenCallModal({
  open,
  onOpenChange,
  machineId,
  subtype,
}: QuickOpenCallModalProps) {
  const { openCalls } = useAndon();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const option = subtype ? getCallTypeOption(subtype) : null;

  async function handleCondition(machineCondition: MachineStatus) {
    if (!subtype || !option || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await openCalls([
        {
          machineId,
          category: option.category,
          subtype,
          criticality: "medium",
          machineCondition,
        },
      ]);
      toast.success(`Chamado de ${option.label} aberto.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o chamado");
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
            Informe a condição atual para abrir o chamado de {option?.label ?? "setor"}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <BigButton
            tone="danger"
            size="lg"
            className="min-h-24 whitespace-normal px-4 text-center"
            onClick={() => void handleCondition("stopped")}
            disabled={isSubmitting || !option}
          >
            <CircleStop className="h-8 w-8 shrink-0" />
            <span>Sim — está parada</span>
          </BigButton>
          <BigButton
            tone="success"
            size="lg"
            className="min-h-24 whitespace-normal px-4 text-center"
            onClick={() => void handleCondition("running")}
            disabled={isSubmitting || !option}
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
