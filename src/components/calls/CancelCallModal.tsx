import { useState } from "react";

import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { normalizeCancellationReason } from "@/utils/cancellationUtils";

interface CancelCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelCallModal({ open, onOpenChange, onConfirm }: CancelCallModalProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const normalizedReason = normalizeCancellationReason(reason);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setReason("");
    onOpenChange(nextOpen);
  }

  async function handleConfirm() {
    if (!normalizedReason || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onConfirm(normalizedReason);
      handleOpenChange(false);
    } catch {
      // The caller reports the API error and the dialog stays open for correction or retry.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && handleOpenChange(value)}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-lg overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-2xl">Cancelar chamado</DialogTitle>
          <DialogDescription className="text-base">
            Informe por que este chamado está sendo cancelado.
          </DialogDescription>
        </DialogHeader>

        <label className="block text-sm font-bold">
          Justificativa do cancelamento
          <Textarea
            autoFocus
            className="mt-1 min-h-24"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Digite a justificativa"
          />
        </label>

        <DialogFooter className="gap-2">
          <BigButton
            tone="neutral"
            size="md"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting}
          >
            Voltar
          </BigButton>
          <BigButton
            tone="danger"
            size="md"
            onClick={() => void handleConfirm()}
            disabled={!normalizedReason || isSubmitting}
          >
            {isSubmitting ? "Cancelando..." : "Confirmar cancelamento"}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
