import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BigButton } from "@/components/common/BigButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAndon } from "@/context/AndonProvider";
import type { AndonCall } from "@/types/andon";
import { formatShiftName } from "@/utils/technicianDisplayUtils";

interface MaintenanceFollowUpSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: AndonCall | null;
}

export function MaintenanceFollowUpSelectionModal({
  open,
  onOpenChange,
  call,
}: MaintenanceFollowUpSelectionModalProps) {
  const { completeMaintenance } = useAndon();
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeMaintenanceSessions = useMemo(
    () =>
      (call?.technicianSessions ?? []).filter(
        (session) => !session.endedAt && (session.phase === "maintenance" || !session.phase),
      ),
    [call?.technicianSessions],
  );
  const activeSessionKey = activeMaintenanceSessions.map((session) => session.id).join("|");
  useEffect(() => {
    if (!open) return;
    setSelectedSessionIds(new Set(activeSessionKey ? activeSessionKey.split("|") : []));
  }, [activeSessionKey, call?.id, open]);

  if (!call) return null;

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await completeMaintenance({
        callId: call.id,
        followUpSessionIds: Array.from(selectedSessionIds),
      });
      toast.success("Manutenção concluída. Participações atualizadas individualmente.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao concluir manutenção");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !isSubmitting && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Acompanhamento pós-manutenção</DialogTitle>
          <DialogDescription className="text-base">
            Selecione quem continuará fisicamente acompanhando a máquina.
          </DialogDescription>
        </DialogHeader>

        {activeMaintenanceSessions.length === 0 ? (
          <p className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            Não há mantenedor ativo. A manutenção será concluída sem acompanhamento individual.
          </p>
        ) : (
          <div className="space-y-2">
            {activeMaintenanceSessions.map((session) => {
              const selected = selectedSessionIds.has(session.id);
              return (
                <label
                  key={session.id}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={selected}
                    onChange={(event) => {
                      setSelectedSessionIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(session.id);
                        else next.delete(session.id);
                        return next;
                      });
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-base">{session.technicianName}</strong>
                    <small className="text-muted-foreground">
                      {session.technicalArea ?? "Área não informada"}
                      {session.shiftName ? ` · ${formatShiftName(session.shiftName)}` : ""}
                    </small>
                  </span>
                  <span className={selected ? "font-bold text-info" : "text-muted-foreground"}>
                    {selected ? "Continuará acompanhando" : "Encerrar participação"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2">
          <BigButton
            tone="neutral"
            size="md"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </BigButton>
          <BigButton tone="success" size="md" disabled={isSubmitting} onClick={handleConfirm}>
            {isSubmitting ? "Concluindo..." : "Confirmar conclusão da manutenção"}
          </BigButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
