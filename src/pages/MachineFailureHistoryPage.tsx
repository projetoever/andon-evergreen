import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FileWarning, Pencil, Save } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { useAndon } from "@/context/AndonProvider";
import { formatDurationMinutes, diffMinutes } from "@/utils/durationUtils";
import { formatDateTime } from "@/utils/dateTimeUtils";
import { calculateProductionModeBreakdownForPeriod, formatBreakdownDuration } from "@/utils/timeBreakdownUtils";

interface MachineFailureHistoryPageProps { machineId: string; }

export function MachineFailureHistoryPage({ machineId }: MachineFailureHistoryPageProps) {
  const { machines, updateMachineStopEventDescription } = useAndon();
  const machine = machines.find((m) => m.id === machineId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  if (!machine) return <EmptyState icon={<FileWarning className="h-10 w-10" />} title="Máquina não encontrada" description={`A máquina "${machineId}" não existe.`} />;
  const history = machine.stopHistory.slice().sort((a,b)=> new Date(b.stoppedAt).getTime()-new Date(a.stoppedAt).getTime());
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-3">
        <Link to="/machines/$machineId" params={{ machineId }} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted hover:bg-accent md:h-11 md:w-11" aria-label="Voltar para a máquina"><ArrowLeft className="h-6 w-6" /></Link>
        <div><div className="text-xs uppercase tracking-widest text-muted-foreground">Máquina {machine.id}</div><h1 className="text-2xl font-black uppercase tracking-wider text-foreground md:text-3xl">Histórico de Falhas</h1><p className="text-sm text-muted-foreground">{machine.name}</p></div>
      </div></div>
      {history.length===0 ? <EmptyState icon={<FileWarning className="h-12 w-12" />} title="Sem falhas registradas" description="Quando houver falhas para esta máquina, elas aparecerão aqui." /> : <div className="space-y-2.5">{history.map((event)=>{
        const now = new Date();
        const periodEnd = event.resumedAt ?? now.toISOString();
        const duration = event.resumedAt ? event.durationMinutes : diffMinutes(event.stoppedAt, periodEnd);
        const productionBreakdown = calculateProductionModeBreakdownForPeriod({
          periodStart: event.stoppedAt,
          periodEnd,
          productionHistory: machine.productionHistory,
          fallbackProductionMode: event.productionModeAtStart ?? event.productionModeAtEnd ?? machine.productionMode,
          now,
        });
        return <article key={event.id} className="rounded-xl border border-border bg-card p-4">
          <dl className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs uppercase text-muted-foreground">Início</dt><dd className="font-mono text-sm">{formatDateTime(event.stoppedAt)}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Retorno</dt><dd className="font-mono text-sm">{event.resumedAt ? formatDateTime(event.resumedAt) : "Em aberto"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Duração</dt><dd className="font-bold">{formatDurationMinutes(duration)}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Origem</dt><dd className="font-bold">{event.source || "Não informado"}</dd></div>
            <div><dt className="text-xs uppercase text-muted-foreground">Status</dt><dd className="font-bold">{event.resumedAt ? "Finalizada" : "Em aberto"}</dd></div>
            <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs uppercase text-muted-foreground">Descrição da falha</dt><dd className="text-foreground">{editingId===event.id ? <div className="flex flex-col gap-2"><textarea className="min-h-[88px] rounded-xl border border-border bg-background p-3 text-sm" value={editingText} onChange={(e)=>setEditingText(e.target.value)} /><button type="button" onClick={()=>{updateMachineStopEventDescription(machine.id,event.id,editingText.trim());setEditingId(null);}} className="inline-flex items-center gap-2 self-start rounded-xl bg-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-secondary-foreground"><Save className="h-4 w-4" />Salvar</button></div> : <div className="flex items-start justify-between gap-3"><span>{event.failureDescription || "Sem descrição"}</span><button type="button" onClick={()=>{setEditingId(event.id);setEditingText(event.failureDescription || "");}} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-bold uppercase tracking-wider"><Pencil className="h-4 w-4" />Editar</button></div>}</dd></div>
          </dl>
          <section className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Impacto da falha</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex items-center justify-between"><dt>Parada produtiva</dt><dd className="font-bold">{formatBreakdownDuration(productionBreakdown.scheduledSeconds)}</dd></div>
              <div className="flex items-center justify-between"><dt>Parada sem produção programada</dt><dd className="font-bold">{formatBreakdownDuration(productionBreakdown.notScheduledSeconds)}</dd></div>
            </dl>
          </section>
        </article>;})}</div>}
    </div>;
}
