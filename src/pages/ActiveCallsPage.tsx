import { useMemo, useState } from "react";
import { useAndon } from "@/context/AndonProvider";
import { ActiveCallList } from "@/components/calls/ActiveCallList";
import { FinishCallModal } from "@/components/calls/FinishCallModal";
import { StartAttendanceModal } from "@/components/calls/StartAttendanceModal";
import { toast } from "sonner";

export function ActiveCallsPage() {
  const { calls, completeMaintenance, returnToMaintenance } = useAndon();
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

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold uppercase tracking-wider text-foreground">
        Chamados ativos
      </h2>
      <ActiveCallList
        calls={activeCalls}
        onAttend={handleAttend}
        onFinish={setFinishCallId}
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
