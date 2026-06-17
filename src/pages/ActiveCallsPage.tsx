import { useMemo, useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { ActiveCallList } from "@/components/calls/ActiveCallList";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { StartAttendanceModal } from "@/components/calls/StartAttendanceModal";
import { toast } from "sonner";
import { requiresMaintenanceTechnician } from "@/utils/callTypeUtils";

export function ActiveCallsPage() {
  const { calls, attendCall, completeMaintenance, returnToMaintenance, cancelCall } = useAndon();
  const [finishCallId, setFinishCallId] = useState<string | null>(null);
  const [startAttendanceCallId, setStartAttendanceCallId] = useState<string | null>(null);

  const activeCalls = useMemo(
    () =>
      calls
        .filter(
          (c) =>
            c.status === "open" || c.status === "in_progress" || c.status === "post_maintenance",
        )
        .sort((a, b) => a.openedAt.localeCompare(b.openedAt)),
    [calls],
  );

  function handleAttend(callId: string) {
    const call = calls.find((item) => item.id === callId);
    if (call && !requiresMaintenanceTechnician(call)) {
      try {
        attendCall({ callId, technicians: [] });
        toast.success("Chamado em atendimento");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atender chamado");
      }
      return;
    }

    setStartAttendanceCallId(callId);
  }

  function handleCompleteMaintenance(callId: string) {
    try {
      completeMaintenance(callId);
      toast.success("Manutenção concluída. Chamado em acompanhamento");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleReturnToMaintenance(callId: string) {
    try {
      returnToMaintenance(callId);
      toast.success("Chamado voltou à manutenção");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  function handleCancel(callId: string) {
    const confirmed = window.confirm(
      "Deseja cancelar este chamado? Use apenas se foi aberto por engano ou resolvido antes do atendimento.",
    );
    if (!confirmed) return;

    try {
      cancelCall({ callId, reason: "Aberto por engano", cancelledBy: "operador" });
      toast.success("Chamado cancelado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não é possível cancelar chamado já atendido.");
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold uppercase tracking-wider text-foreground">
        Chamados ativos
      </h2>
      <ActiveCallList
        calls={activeCalls}
        onAttend={handleAttend}
        onFinish={setFinishCallId}
        onCancel={handleCancel}
        onCompleteMaintenance={handleCompleteMaintenance}
        onReturnToMaintenance={handleReturnToMaintenance}
      />
      <FinishCallModal
        open={finishCallId !== null}
        onOpenChange={(o) => !o && setFinishCallId(null)}
        callId={finishCallId}
      />
      <StartAttendanceModal
        open={startAttendanceCallId !== null}
        onOpenChange={(open) => !open && setStartAttendanceCallId(null)}
        callId={startAttendanceCallId}
      />
    </div>
  );
}
