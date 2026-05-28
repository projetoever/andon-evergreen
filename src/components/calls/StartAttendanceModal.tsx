import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BigButton } from "@/components/common/BigButton";
import { TechnicianSelector } from "@/components/calls/TechnicianSelector";

interface StartAttendanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

export function StartAttendanceModal({ open, onOpenChange, callId }: StartAttendanceModalProps) {
  const { calls, attendCall } = useAndon();
  const [names, setNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const call = callId ? calls.find((item) => item.id === callId) ?? null : null;
  const area = call ? getCallTypeOption(call.subtype)?.technicianArea : null;

  useEffect(() => {
    if (!open) return;
    setNames([]);
    setNotes("");
  }, [open, callId]);

  if (!call) return null;

  function resolveSelected() {
    const configs = JSON.parse(localStorage.getItem("andonTechniciansConfig") ?? "[]") as any[];
    return names.map((name) => {
      const config = configs.find((t) => t.name === name);
      return {
        name,
        id: config?.id,
        shiftId: config?.shiftId,
        shiftName: config?.shiftId,
        technicalArea: config?.area ?? area ?? undefined,
      };
    });
  }

  function startWithTechnicians() {
    if (names.length === 0) {
      toast.error("Selecione pelo menos um manutentor para iniciar o atendimento.");
      return;
    }
    attendCall({ callId: call.id, technicians: resolveSelected(), notes });
    toast.success("Chamado em atendimento");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">Iniciar atendimento</DialogTitle>
          <DialogDescription className="text-base">
            Selecione pelo menos um manutentor para iniciar o atendimento.
          </DialogDescription>
        </DialogHeader>

        {area && <TechnicianSelector area={area} value={names} onChange={setNames} />}

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Observação inicial (opcional)
          </h4>
          <Textarea
            placeholder="Descreva o contexto inicial do atendimento."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-base"
          />
        </div>

        <DialogFooter className="gap-2">
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>Cancelar</BigButton>
          <BigButton tone="success" size="md" onClick={startWithTechnicians}>Iniciar atendimento</BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
