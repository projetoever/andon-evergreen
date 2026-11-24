import { ui, getInterfaceLocale } from "@/i18n/translate";
import type {
  GlobalHistoryCallDetail,
  GlobalHistoryFailureEvent,
  GlobalHistoryTechnicianSession,
} from "@/services/globalHistoryService";
import { Activity, Clock3, FileText, Gauge, Users, Wrench } from "lucide-react";
import {
  historicalCallImpact, historySessionMinutes, historyTechnicianTotals,
} from "@/utils/globalHistoryDetailMetrics";
import { formatBreakdownDuration } from "@/utils/timeBreakdownUtils";

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
  for (const audit of call.auditEvents || []) {
    entries.push({ id: "audit-"+audit.id, at: audit.occurredAt,
      label: ui("Evento auditado") + ": " + audit.action,
      description: [audit.actorName, audit.result].filter(Boolean).join(" · ") });
  }
  for (const diagnosis of call.diagnosisAudits || []) {
    const changes = [
      diagnosis.previousClassification !== diagnosis.newClassification ? ui("Classificação") : null,
      diagnosis.previousResponsibility !== diagnosis.newResponsibility ? ui("Responsabilidade") : null,
      diagnosis.previousDisposition !== diagnosis.newDisposition ? ui("Política analítica") : null,
    ].filter(Boolean);
    entries.push({ id: "diagnosis-"+diagnosis.id, at: diagnosis.createdAt,
      label: ui("Revisão de diagnóstico registrada"),
      description: [diagnosis.technicianName, changes.join(", ")].filter(Boolean).join(" · ") });
  }
  // Machine-stop impacts are a distinct time series; display raw timestamps
  // and source without merging them into attendance or total call durations.
  for (const interval of call.impactIntervals || []) {
    if (interval.startedAt) entries.push({
      id: "impact-start-" + interval.id,
      at: interval.startedAt,
      label: ui("Início de impacto de parada"),
      description: interval.source,
    });
    if (interval.endedAt) entries.push({
      id: "impact-end-" + interval.id,
      at: interval.endedAt,
      label: ui("Fim de impacto de parada"),
      description: interval.source,
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
  const minutes = historySessionMinutes(session);
  return (
    <li className="rounded-lg border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="break-words">{session.technicianName}</strong>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">
          {session.phase === "follow_up" ? ui("Acompanhamento") : ui("Atendimento")}
        </span>
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">{ui("Início da sessão")}</dt>
          <dd className="font-medium">{showInstant(session.startedAt)}</dd></div>
        <div><dt className="text-muted-foreground">{ui("Fim da sessão")}</dt>
          <dd className="font-medium">{showInstant(session.endedAt)}</dd></div>
        <div className="rounded-md border border-info/30 bg-info/10 px-2 py-1">
          <dt className="text-muted-foreground">{ui("Duração da sessão")}</dt>
          <dd className="font-mono font-black tabular-nums text-info">{showMinutes(minutes)}</dd>
        </div>
      </dl>
      {!session.endedAt && <p className="mt-2 text-xs text-muted-foreground">
        {ui("Sessão sem encerramento registrado; duração não apurada.")}
      </p>}
      {session.endReason && <p className="mt-2 text-xs text-muted-foreground">
        {ui("Motivo de saída")}: {session.endReason}
      </p>}
      {session.notes && <p className="mt-2 whitespace-pre-wrap break-words">{session.notes}</p>}
    </li>
  );
}

function TechnicianTotals({call}:{call:GlobalHistoryCallDetail}) {
  const totals = historyTechnicianTotals(call.technicianSessions ?? []);
  const legacy = (!totals.length ? call.technicianTimeAllocations ?? [] : [])
    .filter(row => Number.isFinite(row.minutes) && row.minutes >= 0);
  return (
    <>
      {totals.length > 0 && <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {totals.map(row => <div key={row.key} className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <strong>{row.name}</strong><span className="text-xs text-muted-foreground">
              {row.sessions} {ui("sessões registradas")}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-info/10 p-2">
              <dt className="text-muted-foreground">{ui("Atendimento")}</dt>
              <dd className="font-mono font-bold tabular-nums text-info">{showMinutes(row.maintenanceMinutes)}</dd>
            </div>
            <div className="rounded-md bg-success/10 p-2">
              <dt className="text-muted-foreground">{ui("Acompanhamento")}</dt>
              <dd className="font-mono font-bold tabular-nums text-success">{showMinutes(row.followUpMinutes)}</dd>
            </div>
            <div className="rounded-md bg-muted p-2">
              <dt className="text-muted-foreground">{ui("Total individual")}</dt>
              <dd className="font-mono font-bold tabular-nums">
                {showMinutes(row.maintenanceMinutes + row.followUpMinutes)}
              </dd>
            </div>
          </dl>
          {row.measuredSessions !== row.sessions && <p className="mt-2 text-xs text-warning">
            {ui("Total parcial: há sessões sem duração comprovada.")}
          </p>}
        </div>)}
      </div>}
      {legacy.length > 0 && <div className="mt-3 space-y-2">
        <p className="text-xs text-muted-foreground">
          {ui("Alocações legadas registradas; os tempos não foram reconstruídos por sessão.")}
        </p>
        {legacy.map((row, index) => <div key={index}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background p-3 text-sm">
          <strong>{row.technicianName || ui("Sem mantenedor apontado")}</strong>
          <span className="font-mono font-bold tabular-nums">{showMinutes(row.minutes)}</span>
        </div>)}
      </div>}
      {Boolean(call.technicianSessions?.length) && <ul className="mt-3 space-y-2">
        {call.technicianSessions.map(s => <TechnicianRow key={s.id} session={s}/>)}
      </ul>}
      {!call.technicianSessions?.length && !legacy.length &&
        <p className="mt-2 text-sm text-muted-foreground">{ui("Sem sessões de mantenedores registradas.")}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        {ui("Tempos individuais representam sessões comprovadas; atuações simultâneas não devem ser somadas como tempo de máquina.")}
      </p>
    </>
  );
}

function OperationalImpact({call}:{call:GlobalHistoryCallDetail}) {
  const breakdown = historicalCallImpact(call, new Date().toISOString());
  const categories = [
    {label: "Parada produtiva", seconds: breakdown?.productiveDowntimeSeconds, color: "text-danger"},
    {label: "Em falha sem produção programada", seconds: breakdown?.nonScheduledDowntimeSeconds, color: "text-warning"},
    {label: "Atendimento sem impacto produtivo", seconds: breakdown?.productionBlockedSupportSeconds, color: "text-info"},
    {label: "Atendimento fora de produção", seconds: breakdown?.nonScheduledSupportSeconds, color: "text-success"},
  ];
  const stopped = call.machineStoppedMinutes;
  const stopState = typeof stopped !== "number" || !Number.isFinite(stopped)
    ? "Parada não apurada"
    : stopped > 0 ? "Com parada registrada" : "Sem parada registrada";
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Impacto operacional")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Gauge className="h-4 w-4 text-primary" />{ui("Impacto operacional")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Impacto atribuído ao chamado e classificação por histórico de produção, quando comprovada.")}
          </p>
        </div>
        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs font-semibold">
          {ui(stopState)}
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="text-xs text-muted-foreground">{ui("Parada atribuída ao chamado")}</div>
        <strong className="font-mono text-xl tabular-nums">{showMinutes(stopped)}</strong>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {categories.map(item => <div key={item.label}
          className="rounded-lg border border-border bg-background p-3">
          <dt className="text-xs text-muted-foreground">{ui(item.label)}</dt>
          <dd className={`mt-1 font-mono text-lg font-black tabular-nums ${item.color}`}>
            {typeof item.seconds === "number" ? formatBreakdownDuration(item.seconds) : "—"}
          </dd>
        </div>)}
      </dl>
      {!breakdown && <p role="note" className="mt-2 text-xs text-warning">
        {ui("Classificação produtiva indisponível: faltam intervalos completos de programação ou rastreamento confiável da parada. O tempo oficial de parada permanece exibido acima.")}
      </p>}
      {breakdown && <p role="note" className="mt-2 text-xs text-muted-foreground">
        {ui("Distribuição temporal do chamado conforme intervalos reais de produção e de parada, sem alterar indicadores oficiais do BI.")}
      </p>}
      {call.impactIntervals?.length > 0 && <details className="mt-3 rounded-lg border border-border bg-muted/10 p-3 text-xs">
        <summary className="cursor-pointer font-bold">{ui("Intervalos de parada atribuídos ao chamado")}</summary>
        <ul className="mt-2 space-y-2">
          {call.impactIntervals.map(row => <li key={row.id} className="rounded-md border border-border bg-background p-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{showInstant(row.startedAt)} — {showInstant(row.endedAt)}</span>
              <strong>{row.durationSeconds !== null && Number.isFinite(row.durationSeconds)
                ? formatBreakdownDuration(row.durationSeconds!) : "—"}</strong>
            </div>
            <div className="mt-1 text-muted-foreground">{ui("Origem")}: {row.source}</div>
          </li>)}
        </ul>
      </details>}
    </section>
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
      <OperationalImpact call={call}/>
      <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Linha do tempo do chamado")}>
        <h3 className="flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-primary"/>{ui("Linha do tempo do chamado")}</h3>
        {timeline.length ? (
          <ol className="mt-3 space-y-3 border-l-2 border-border pl-4">
            {timeline.map(event=><li key={event.id} className="relative text-sm">
              <span className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${event.id.startsWith("impact-") ? "bg-danger" : event.id.startsWith("tech-") ? "bg-info" : event.id.startsWith("audit-") ? "bg-warning" : "bg-primary"}`} aria-hidden="true"/>
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
        <TechnicianTotals call={call}/>
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
        {ui("A linha do tempo contém apenas eventos vinculados a este chamado e máquina. Eventos administrativos sem vínculo e registros legados ausentes não são inventados.")}
        {call.auditTruncated && <strong className="mt-1 block text-warning">
          {ui("Há mais de 200 registros auditáveis. Exibição parcial; consulte a auditoria autorizada para análise integral.")}
        </strong>}
      </p>
    </div>
  );
}
