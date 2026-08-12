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
            !c.isSystemTest &&
            (c.status === "open" ||
              c.status === "in_progress" ||
              c.status === "post_maintenance"),
        )
        .sort((a, b) => a.openedAt.localeCompare(b.openedAt)),
    [calls],
  );

  async function handleAttend(callId: string) {
    const call = calls.find((item) => item.id === callId);
    if (call && !requiresMaintenanceTechnician(call)) {
      try {
        await attendCall({ callId, technicians: [] });
        toast.success("Chamado em atendimento");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao atender chamado");
      }
      return;
    }

    setStartAttendanceCallId(callId);
  }

  async function handleCompleteMaintenance(callId: string) {
    try {
      await completeMaintenance(callId);
      toast.success("Manutenção concluída. Chamado em acompanhamento");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleReturnToMaintenance(callId: string) {
    try {
      await returnToMaintenance(callId);
      toast.success("Chamado voltou à manutenção");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  async function handleCancel(callId: string) {
    try {
      await cancelCall({ callId, reason: "Aberto por engano", cancelledBy: "operador" });
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
        onAttend={(callId) => void handleAttend(callId)}
        onFinish={setFinishCallId}
        onCancel={(callId) => void handleCancel(callId)}
        onCompleteMaintenance={(callId) => void handleCompleteMaintenance(callId)}
        onReturnToMaintenance={(callId) => void handleReturnToMaintenance(callId)}
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
