import { useState } from "react";
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
import { calculateOperationalImpactBreakdown, formatBreakdownDuration } from "@/utils/timeBreakdownUtils";
import { formatShiftName, formatTimeAllocationSource } from "@/utils/technicianDisplayUtils";

interface MachineCallHistoryPageProps { machineId: string; }

export function MachineCallHistoryPage({ machineId }: MachineCallHistoryPageProps) {
  const { machines, calls } = useAndon();
  const [expandedCallIds, setExpandedCallIds] = useState<string[]>([]);
  const machine = machines.find((m) => m.id === machineId);
  const machineCalls = calls.filter((call) => call.machineId === machineId).slice().sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  if (!machine) return <EmptyState icon={<History className="h-10 w-10" />} title="Máquina não encontrada" description={`A máquina "${machineId}" não existe.`} />;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-3">
        <Link to="/machines/$machineId" params={{ machineId }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-11 md:w-11" aria-label="Voltar para a máquina"><ArrowLeft className="h-6 w-6" /></Link>
        <div><div className="text-xs uppercase tracking-widest text-muted-foreground">Máquina {machine.id}</div><h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">Histórico de Chamados</h1><p className="text-sm text-muted-foreground">{machine.name}</p></div>
      </div>
    </div>

    {machineCalls.length === 0 ? <EmptyState icon={<History className="h-12 w-12" />} title="Sem chamados registrados" description="Quando houver chamados para esta máquina, eles aparecerão aqui." /> :
      <div className="space-y-2">{machineCalls.map((call) => {
        const now = new Date();
        const waitingMinutes = call.status === "finished" ? call.callWaitingMinutes : calculateCallWaitingMinutes(call);
        const attendanceMinutes = call.status === "finished" ? call.attendanceMinutes : calculateAttendanceMinutes(call);
        const postMaintenanceMinutes = call.status === "finished" ? call.postMaintenanceMinutes : calculatePostMaintenanceMinutes(call);
        const totalMinutes = call.status === "finished" ? call.totalCallMinutes : calculateTotalCallMinutes(call);
        const technicianNames = call.technicianNames.length > 0 ? call.technicianNames.join(", ") : call.technicianName || "Não informado";
        const isExpanded = expandedCallIds.includes(call.id);

        const attendanceStart = call.attendedAt ?? call.openedAt;
        const attendanceEnd = call.maintenanceCompletedAt ?? call.finishedAt ?? now.toISOString();
        const impactBreakdown = calculateOperationalImpactBreakdown({
          periodStart: attendanceStart, periodEnd: attendanceEnd, stopHistory: machine.stopHistory, productionHistory: machine.productionHistory,
          fallbackMachineCondition: call.machineCondition ?? call.machineStatusAtAttend ?? call.machineStatusAtOpen ?? call.machineStatusAtFinish ?? machine.machineStatus,
          fallbackProductionMode: call.productionModeAtAttend ?? call.productionModeAtOpen ?? call.productionModeAtFinish ?? machine.productionMode, now,
        });

        const sessions = call.technicianSessions ?? [];
        const allocations = Array.isArray((call as any).technicianTimeAllocations) ? (call as any).technicianTimeAllocations : [];

        const allocationRows = allocations.map((allocation: any, index: number) => ({
          id: allocation.technicianId ?? allocation.technicianName ?? `allocation-${index}`,
          technicianName: allocation.technicianName || "Sem manutentor apontado",
          startedAt: allocation.startedAt ?? null,
          endedAt: allocation.endedAt ?? null,
          minutes: typeof allocation.minutes === "number" ? allocation.minutes : 0,
          source: allocation.source,
        }));

        const unassignedRows = allocationRows.filter((row: any) => row.source === "unassigned_time");
        const technicianRows = allocationRows.filter((row: any) => row.source !== "unassigned_time");

        return <article key={call.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{formatDateTime(call.openedAt)}</div>
              <h2 className="text-base font-black text-foreground md:text-lg">{call.category === "maintenance" ? "Manutenção" : "Produção"} • {getCallSubtypeLabel(call.subtype)}</h2>
              <div className="mt-1 text-sm text-muted-foreground">Tempo total: <span className="font-bold text-foreground">{formatDurationMinutes(totalMinutes)}</span></div>
              <div className="text-sm text-muted-foreground">Técnicos: {technicianNames}</div>
            </div>
            <div className="flex flex-col items-end gap-2"><span className="rounded-full bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{getAndonStatusLabel(call.status)}</span><button type="button" className="text-xs font-semibold text-info hover:underline" onClick={() => setExpandedCallIds((prev) => prev.includes(call.id) ? prev.filter((id) => id !== call.id) : [...prev, call.id])}>{isExpanded ? "Ocultar detalhes" : "Mais detalhes"}</button></div>
          </div>

          {isExpanded && <>
            <dl className="mt-3 grid grid-cols-1 gap-x-3 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs uppercase text-muted-foreground">Aberto em</dt><dd className="font-mono">{formatDateTime(call.openedAt)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Atendido em</dt><dd className="font-mono">{formatDateTime(call.attendedAt)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Conclusão da manutenção</dt><dd className="font-mono">{formatDateTime(call.maintenanceCompletedAt)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Finalizado em</dt><dd className="font-mono">{formatDateTime(call.finishedAt)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Criticidade</dt><dd className="font-bold">{getCriticalityLabel(call.criticality)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Área técnica</dt><dd className="font-bold">{getTechnicianAreaLabel(call.technicianArea)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Condição da máquina</dt><dd className="font-bold">{getMachineConditionLabel(call.machineCondition)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Retornos à manutenção</dt><dd className="font-bold">{call.maintenanceReturnCount}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Tempo de ANDON</dt><dd className="font-bold text-warning">{formatDurationMinutes(waitingMinutes)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Tempo de atendimento</dt><dd className="font-bold text-info">{formatDurationMinutes(attendanceMinutes)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Tempo de acompanhamento</dt><dd className="font-bold text-info">{formatDurationMinutes(postMaintenanceMinutes)}</dd></div>
              <div><dt className="text-xs uppercase text-muted-foreground">Descrição</dt><dd>{call.notes || "Sem descrição"}</dd></div>
            </dl>

            <section className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Atendimento por manutentor</h3>
              <div className="space-y-2">
                {technicianRows.length > 0 ? technicianRows.map((row: any) => <div key={row.id} className="rounded border border-border bg-card p-2 text-sm">
                  <div className="font-semibold">{row.technicianName}</div>
                  <div>Início: {formatDateTime(row.startedAt)}</div>
                  <div>Fim: {formatDateTime(row.endedAt)}</div>
                  <div>Tempo: {row.minutes > 0 ? formatDurationMinutes(row.minutes) : "—"}</div>
                  {row.source && <div className="text-xs text-muted-foreground">Origem: {formatTimeAllocationSource(row.source)}</div>}
                </div>) : sessions.length > 0 ? sessions.map((session) => {
                  const end = session.endedAt ?? now.toISOString();
                  const minutes = (new Date(end).getTime() - new Date(session.startedAt).getTime()) / 60000;
                  return <div key={session.id} className="rounded border border-border bg-card p-2 text-sm"><div className="font-semibold">{session.technicianName}</div><div>Início: {formatDateTime(session.startedAt)}</div><div>Fim: {formatDateTime(session.endedAt ?? null)}</div><div>Tempo: {formatDurationMinutes(minutes)}</div>{session.shiftName && <div className="text-xs text-muted-foreground">Turno: {formatShiftName(session.shiftName)}</div>}</div>;
                }) : <div className="text-sm text-muted-foreground">Não informado</div>}

                {unassignedRows.map((row: any) => <div key={`${row.id}-unassigned`} className="rounded border border-dashed border-border bg-card p-2 text-sm text-muted-foreground"><div className="font-semibold">Tempo sem manutentor apontado</div><div>Início: {formatDateTime(row.startedAt)}</div><div>Fim: {formatDateTime(row.endedAt)}</div><div>Tempo: {row.minutes > 0 ? formatDurationMinutes(row.minutes) : "—"}</div></div>)}
              </div>
            </section>

            <section className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
              <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Impacto operacional</h3>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2"><dt>Parada produtiva</dt><dd className="font-bold">{formatBreakdownDuration(impactBreakdown.productiveDowntimeSeconds)}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt>Em falha sem produção programada</dt><dd className="font-bold">{formatBreakdownDuration(impactBreakdown.nonScheduledDowntimeSeconds)}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt>Atendimento sem impacto produtivo</dt><dd className="font-bold">{formatBreakdownDuration(impactBreakdown.productionBlockedSupportSeconds)}</dd></div>
                <div className="flex items-center justify-between gap-2"><dt>Atendimento fora de produção</dt><dd className="font-bold">{formatBreakdownDuration(impactBreakdown.nonScheduledSupportSeconds)}</dd></div>
              </dl>
            </section>
          </>}
        </article>;
      })}</div>}
  </div>;
}
