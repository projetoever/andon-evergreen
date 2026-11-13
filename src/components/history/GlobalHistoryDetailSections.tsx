import { ui, getInterfaceLocale } from "@/i18n/translate";
import type {
  GlobalHistoryCallDetail,
  GlobalHistoryFailureEvent,
  GlobalHistoryTechnicianSession,
} from "@/services/globalHistoryService";
import { Activity, Clock3, FileText, Users, Wrench } from "lucide-react";

function showInstant(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString(getInterfaceLocale(), {
    dateStyle: "short", timeStyle: "short",
  }) : "—";
}

function showMinutes(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${value.toLocaleString(getInterfaceLocale(), {maximumFractionDigits:1})} min`
    : "—";
}

type EventLine = {
  id: string;
  at: string;
  label: string;
  description?: string | null;
};

function callTimeline(call: GlobalHistoryCallDetail): EventLine[] {
  const entries: EventLine[] = [{ id: "opened", at: call.openedAt, label: ui("Abertura do chamado") }];
  if (call.attendedAt)
    entries.push({ id:"attended", at:call.attendedAt, label:ui("Início do atendimento") });
  if (call.maintenanceCompletedAt)
    entries.push({ id:"maintenance", at:call.maintenanceCompletedAt, label:ui("Conclusão da manutenção") });
  if (call.finishedAt)
    entries.push({ id:"finished", at:call.finishedAt, label:ui("Encerramento ou cancelamento") });
  for (const s of call.technicianSessions || []) {
    if (s.startedAt) entries.push({
      id:"tech-start-"+s.id,at:s.startedAt,label:ui("Entrada de mantenedor"),
      description:s.technicianName,
    });
    if (s.endedAt) entries.push({
      id:"tech-end-"+s.id,at:s.endedAt,label:ui("Saída de mantenedor"),
      description:s.technicianName,
    });
  }
  for (const e of call.failureEvents || []) {
    entries.push({
      id:"failure-start-"+e.id,at:e.startedAt,label:ui("Início de evento de falha"),
      description:e.classification,
    });
    if (e.endedAt) entries.push({
      id:"failure-end-"+e.id,at:e.endedAt,label:ui("Fim do evento de falha"),
      description:e.classification,
    });
  }
  return entries
    .filter(e=>Number.isFinite(Date.parse(e.at)))
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at) || a.id.localeCompare(b.id));
}

function TechnicianRow({session}:{session:GlobalHistoryTechnicianSession}) {
  return (
    <li className="rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <strong className="break-words">{session.technicianName}</strong>
        <span className="text-xs text-muted-foreground">
          {session.phase === "follow_up" ? ui("Acompanhamento") : ui("Atendimento")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {showInstant(session.startedAt)} — {showInstant(session.endedAt)}
      </p>
      {session.notes && <p className="mt-2 whitespace-pre-wrap break-words">{session.notes}</p>}
    </li>
  );
}

function FailureEventRow({event}:{event:GlobalHistoryFailureEvent}) {
  return (
    <li className="rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{event.classification || ui("Falha sem classificação")}</strong>
        <span className="text-xs text-muted-foreground">{showInstant(event.startedAt)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {ui("Fim")} {showInstant(event.endedAt)}
        {" · "}{ui("Duração registrada")} {event.durationSeconds != null &&
          Number.isFinite(event.durationSeconds) && event.durationSeconds >= 0
          ? showMinutes(event.durationSeconds/60) : "—"}
      </p>
      {event.notes && <p className="mt-2 whitespace-pre-wrap break-words">{event.notes}</p>}
    </li>
  );
}

export function GlobalHistoryDetailSections({call}:{call:GlobalHistoryCallDetail}) {
  const durations = [
    {label:ui("Espera"), value:call.callWaitingMinutes},
    {label:ui("Atendimento"), value:call.attendanceMinutes},
    {label:ui("Acompanhamento"), value:call.postMaintenanceMinutes},
    {label:ui("Tempo total"), value:call.totalCallMinutes},
    {label:ui("Parada atribuída ao chamado"), value:call.machineStoppedMinutes},
  ];
  // These are separately stored measures, not mutually exclusive intervals.
  // Visualize relative magnitudes, but never sum or assert causal KPIs.
  const max = Math.max(1, ...durations.map(x=>typeof x.value==="number" &&
    Number.isFinite(x.value) && x.value>0 ? x.value : 0));
  const timeline = callTimeline(call);
  return (
    <div className="space-y-5" aria-label={ui("Registro completo disponível")}>
      <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Tempos registrados")}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Clock3 className="h-4 w-4 text-primary"/>{ui("Tempos registrados")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{ui("Barras indicativas dos tempos registrados. Os intervalos podem se sobrepor; não representam soma de KPIs.")}</p>
        <div className="mt-3 space-y-3">
          {durations.map(item=><div key={item.label} className="space-y-1">
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{item.label}</span><strong>{showMinutes(item.value)}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{width:
                typeof item.value==="number" && Number.isFinite(item.value) && item.value>0
                  ? `${Math.min(100,item.value/max*100)}%` : "0%"}}/>
            </div>
          </div>)}
        </div>
      </section>
      <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Linha do tempo do chamado")}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-primary"/>{ui("Linha do tempo do chamado")}</h3>
        {timeline.length ? (
          <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
            {timeline.map(event=><li key={event.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" aria-hidden="true"/>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{event.label}</strong><time className="text-xs text-muted-foreground">{showInstant(event.at)}</time>
              </div>
              {event.description && <p className="mt-1 break-words text-xs text-muted-foreground">{event.description}</p>}
            </li>)}
          </ol>
        ) : <p className="mt-2 text-sm text-muted-foreground">{ui("Nenhum evento com horário válido.")}</p>}
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4 text-primary"/>{ui("Participação dos mantenedores")}</h3>
        {call.technicianSessions?.length ? <ul className="mt-3 space-y-2">
          {call.technicianSessions.map(s=><TechnicianRow key={s.id} session={s}/>)}
        </ul> : <p className="mt-2 text-sm text-muted-foreground">{ui("Sem sessões de mantenedores registradas.")}</p>}
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Wrench className="h-4 w-4 text-primary"/>{ui("Eventos de falha vinculados")}</h3>
        {call.failureEvents?.length ? <ul className="mt-3 space-y-2">
          {call.failureEvents.map(e=><FailureEventRow key={e.id} event={e}/>)}
        </ul> : <p className="mt-2 text-sm text-muted-foreground">{ui("Nenhum evento de falha vinculado a este chamado.")}</p>}
      </section>
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><FileText className="h-4 w-4 text-primary"/>{ui("Anotações e diagnóstico")}</h3>
        <dl className="mt-3 space-y-3">
          {([
            [ui("Informação do operador"),call.operatorNote],
            [ui("Descrição da falha"),call.failureDescription],
            [ui("Anotações do chamado"),call.notes],
            [ui("Motivo do cancelamento"),call.cancelReason],
          ] as const).map(([label,value])=><div key={label} className="text-sm">
            <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words">{value || "—"}</dd>
          </div>)}
        </dl>
      </section>
      <p role="note" className="rounded-lg border border-info/40 bg-info/10 p-3 text-xs text-muted-foreground">
        {ui("Eventos e tempos apresentados conforme registros existentes. A auditoria administrativa completa, eventos sem vínculo e exportações serão integrados em etapa posterior.")}
      </p>
    </div>
  );
}
