import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAndon } from "@/context/AndonProvider";
import { getCallTypeOption } from "@/data/callTypes";
import { TechnicianSelector } from "./TechnicianSelector";
import { BigButton } from "@/components/common/BigButton";
import { getCallSubtypeLabel } from "@/utils/statusUtils";
import { toast } from "sonner";

interface FinishCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

export function FinishCallModal({ open, onOpenChange, callId }: FinishCallModalProps) {
  const { calls, finishCall } = useAndon();
  const call = callId ? calls.find((c) => c.id === callId) ?? null : null;
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      const sessionNames = Array.from(new Set((call?.technicianSessions ?? []).map((session) => session.technicianName)));
      setTechnicianNames(sessionNames);
      setNotes("");
    }
  }, [open, callId]);

  if (!call) return null;
  const opt = getCallTypeOption(call.subtype);
  const requiresTechnician = call.category === "maintenance";

  function resolveSelectedTechnicians() {
    const configs = JSON.parse(localStorage.getItem("andonTechniciansConfig") ?? "[]") as any[];
    return technicianNames.map((name) => {
      const config = configs.find((item) => item.name === name);
      return {
        name,
        id: config?.id,
        shiftId: config?.shiftId,
        shiftName: config?.shiftId,
        technicalArea: config?.area ?? opt?.technicianArea ?? undefined,
      };
    });
  }

  function handleConfirm() {
    if (!call) return;
    try {
      finishCall({
        callId: call.id,
        technicianName: technicianNames[0] ?? null,
        technicianNames,
        technicianArea: opt?.technicianArea ?? null,
        selectedTechnicians: resolveSelectedTechnicians(),
        notes: notes.trim() || null,
      });
      toast.success(`Chamado da Máquina ${call.machineId} finalizado`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao finalizar chamado");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl">Finalizar Chamado</DialogTitle>
          <DialogDescription className="text-base">
            Máquina {call.machineId} · {getCallSubtypeLabel(call.subtype)}
          </DialogDescription>
        </DialogHeader>

        {requiresTechnician && opt?.technicianArea && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Selecione um ou mais manutentores
            </h4>
            <TechnicianSelector
              area={opt.technicianArea}
              value={technicianNames}
              onChange={setTechnicianNames}
            />
          </div>
        )}

        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Observações (opcional)
          </h4>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Descreva o atendimento, peças trocadas, etc."
            className="text-base"
          />
        </div>

        <DialogFooter className="gap-2">
          <BigButton tone="neutral" size="md" onClick={() => onOpenChange(false)}>
            Cancelar
          </BigButton>
          <BigButton
            tone="success"
            size="md"
            onClick={handleConfirm}
            disabled={requiresTechnician && technicianNames.length === 0}
          >
            Finalizar
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
