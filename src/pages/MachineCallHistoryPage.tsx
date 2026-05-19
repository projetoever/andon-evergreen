import { Link } from "@tanstack/react-router";
import { ArrowLeft, History } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { useAndon } from "@/context/AndonProvider";
import {
  calculateAttendanceMinutes,
  calculateCallWaitingMinutes,
  calculatePostMaintenanceMinutes,
  calculateTotalCallMinutes,
  formatDurationMinutes,
} from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import {
  getAndonStatusLabel,
  getCallSubtypeLabel,
  getCriticalityLabel,
  getMachineConditionLabel,
  getTechnicianAreaLabel,
} from "@/utils/statusUtils";

interface MachineCallHistoryPageProps {
  machineId: string;
}

export function MachineCallHistoryPage({ machineId }: MachineCallHistoryPageProps) {
  const { machines, calls } = useAndon();
  const machine = machines.find((m) => m.id === machineId);
  const machineCalls = calls
    .filter((call) => call.machineId === machineId)
    .slice()
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  if (!machine) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="Máquina não encontrada"
        description={`A máquina "${machineId}" não existe.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-center gap-3">
          <Link
            to="/machines/$machineId"
            params={{ machineId }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-11 md:w-11"
            aria-label="Voltar para a máquina"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Máquina {machine.id}
            </div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">
              Histórico de Chamados
            </h1>
            <p className="text-sm text-muted-foreground">{machine.name}</p>
          </div>
        </div>
      </div>

      {machineCalls.length === 0 ? (
        <EmptyState
          icon={<History className="h-12 w-12" />}
          title="Sem chamados registrados"
          description="Quando houver chamados para esta máquina, eles aparecerão aqui."
        />
      ) : (
        <div className="space-y-2.5">
          {machineCalls.map((call) => {
            const technicianNames =
              call.technicianNames.length > 0
                ? call.technicianNames.join(", ")
                : call.technicianName || "Não informado";
            const waitingMinutes =
              call.status === "finished" ? call.callWaitingMinutes : calculateCallWaitingMinutes(call);
            const attendanceMinutes =
              call.status === "finished" ? call.attendanceMinutes : calculateAttendanceMinutes(call);
            const postMaintenanceMinutes =
              call.status === "finished"
                ? call.postMaintenanceMinutes
                : calculatePostMaintenanceMinutes(call);
            const totalMinutes =
              call.status === "finished" ? call.totalCallMinutes : calculateTotalCallMinutes(call);

            return (
              <article key={call.id} className="rounded-xl border border-border bg-card p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm uppercase tracking-widest text-muted-foreground">
                      {formatDateTime(call.openedAt)}
                    </div>
                    <h2 className="text-lg font-black text-foreground md:text-xl">
                      {call.category === "maintenance" ? "Manutenção" : "Produção"} · {getCallSubtypeLabel(call.subtype)}
                    </h2>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {getAndonStatusLabel(call.status)}
                  </span>
                </div>

                <dl className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="text-xs uppercase text-muted-foreground">Aberto em</dt><dd className="font-mono text-base">{formatDateTime(call.openedAt)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Atendido em</dt><dd className="font-mono text-sm">{formatDateTime(call.attendedAt)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Conclusão da manutenção</dt><dd className="font-mono text-sm">{formatDateTime(call.maintenanceCompletedAt)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Finalizado em</dt><dd className="font-mono text-sm">{formatDateTime(call.finishedAt)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Categoria</dt><dd className="font-bold">{call.category === "maintenance" ? "Manutenção" : "Produção"}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Subtipo</dt><dd className="font-bold">{getCallSubtypeLabel(call.subtype)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Criticidade</dt><dd className="font-bold">{getCriticalityLabel(call.criticality)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Status</dt><dd className="font-bold">{getAndonStatusLabel(call.status)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Tempo de ANDON</dt><dd className="font-bold text-warning">{formatDurationMinutes(waitingMinutes)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Tempo de atendimento</dt><dd className="font-bold text-info">{formatDurationMinutes(attendanceMinutes)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Tempo de acompanhamento</dt><dd className="font-bold text-info">{formatDurationMinutes(postMaintenanceMinutes)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Tempo total</dt><dd className="font-bold">{formatDurationMinutes(totalMinutes)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Técnico</dt><dd className="font-bold">{technicianNames}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Área técnica</dt><dd className="font-bold">{getTechnicianAreaLabel(call.technicianArea)}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Retornos à manutenção</dt><dd className="font-bold">{call.maintenanceReturnCount}</dd></div>
                  <div><dt className="text-xs uppercase text-muted-foreground">Condição da máquina</dt><dd className="font-bold">{getMachineConditionLabel(call.machineCondition)}</dd></div>
                  <div className="sm:col-span-2 lg:col-span-4"><dt className="text-xs uppercase text-muted-foreground">Descrição</dt><dd className="text-foreground">{call.notes || "Sem descrição"}</dd></div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
