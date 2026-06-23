import { useEffect, useMemo, useState } from "react";
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
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";
import type { TechnicianArea } from "@/types/andon";
import { toast } from "sonner";

interface FinishCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callId: string | null;
}

const SUPPORT_AREAS: TechnicianArea[] = ["electrical", "mechanical", "hot_melt"];

export function FinishCallModal({ open, onOpenChange, callId }: FinishCallModalProps) {
  const { calls, finishCall } = useAndon();
  const call = callId ? calls.find((c) => c.id === callId) ?? null : null;
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const opt = call ? getCallTypeOption(call.subtype) : null;
  const requiresTechnician = call ? requiresMaintenanceTechnician(call) : false;

  const activeSessionNames = useMemo(
    () =>
      Array.from(
        new Set(
          (call?.technicianSessions ?? [])
            .filter((session) => !session.endedAt)
            .map((session) => session.technicianName),
        ),
      ),
    [call?.technicianSessions],
  );

  const allSessionNames = useMemo(
    () =>
      Array.from(
        new Set((call?.technicianSessions ?? []).map((session) => session.technicianName)),
      ),
    [call?.technicianSessions],
  );

  const optionalFinishTechnicianAreas = useMemo<TechnicianArea[]>(
    () =>
      opt?.technicianArea
        ? SUPPORT_AREAS.filter((supportArea) => supportArea !== opt.technicianArea)
        : [],
    [opt?.technicianArea],
  );

  useEffect(() => {
    if (open) {
      setTechnicianNames(activeSessionNames.length > 0 ? activeSessionNames : allSessionNames);
      setNotes("");
    }
  }, [open, callId, activeSessionNames, allSessionNames]);

  if (!call) return null;

  function resolveSelectedTechnicians() {
    const configs = JSON.parse(localStorage.getItem("andonTechniciansConfig") ?? "[]") as any[];

    return technicianNames.map((name) => {
      const config = configs.find((item) => item.name === name);
      const activeSession = (call.technicianSessions ?? []).find(
        (session) => !session.endedAt && session.technicianName === name,
      );
      const anySession = (call.technicianSessions ?? []).find(
        (session) => session.technicianName === name,
      );

      return {
        name,
        id: config?.id ?? activeSession?.technicianId ?? anySession?.technicianId,
        shiftId: config?.shiftId ?? activeSession?.shiftId ?? anySession?.shiftId,
        shiftName: config?.shiftId ?? activeSession?.shiftName ?? anySession?.shiftName,
        technicalArea:
          config?.area ??
          activeSession?.technicalArea ??
          anySession?.technicalArea ??
          opt?.technicianArea ??
          undefined,
      };
    });
  }

  function handleConfirm() {
    if (!call) return;

    try {
      const selectedTechnicians = resolveSelectedTechnicians();
      const finalTechnicianArea =
        selectedTechnicians[0]?.technicalArea ?? opt?.technicianArea ?? null;

      finishCall({
        callId: call.id,
        technicianName: technicianNames[0] ?? null,
        technicianNames,
        technicianArea: finalTechnicianArea,
        selectedTechnicians,
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

            {activeSessionNames.length > 0 && (
              <p className="mb-2 text-xs text-muted-foreground">
                Pré-selecionado com base nos manutentores ainda ativos no atendimento.
              </p>
            )}

            {activeSessionNames.length === 0 && allSessionNames.length > 0 && (
              <p className="mb-2 text-xs text-warning">
                Nenhum manutentor ativo no momento. Exibindo manutentores que participaram do chamado.
              </p>
            )}

            <TechnicianSelector
              area={opt.technicianArea}
              value={technicianNames}
              onChange={setTechnicianNames}
              optionalAreas={optionalFinishTechnicianAreas}
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
