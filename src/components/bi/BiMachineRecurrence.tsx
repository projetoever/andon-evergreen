import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers3, RotateCcw, ShieldAlert } from "lucide-react";

import type { AnalyticsMachine360 } from "@/types/analytics";

type Group = AnalyticsMachine360["recurrence"]["groups"][number];

const formatHours = (h: number | null) => h === null
  ? "—"
  : h >= 24
    ? `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`
    : `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;

function usePageRows(height: number, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(3);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setRows(Math.max(1, Math.floor(node.clientHeight / height)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [height, ready]);
  return { ref, rows };
}

function Page({
  page, total, pages, change,
}: {
  page: number;
  total: number;
  pages: number;
  change: (n: number) => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-border pt-1 text-[10px] text-muted-foreground">
      <span>{total} registro(s) · página {page + 1}/{pages}</span>
      <div className="flex gap-1">
        <button type="button" aria-label="Anterior" disabled={page === 0}
          onClick={() => change(page - 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Próxima" disabled={page >= pages - 1}
          onClick={() => change(page + 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function BiMachineRecurrence({
  data, classificationLabels,
}: {
  data: AnalyticsMachine360;
  classificationLabels: Map<string, string>;
}) {
  const info = data.recurrence;
  const stats = info.totals;
  const [groupPage, setGroupPage] = useState(0);
  const [timelinePage, setTimelinePage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const { ref: groupViewport, rows: groupRows } = usePageRows(70, Boolean(data));
  const { ref: timelineViewport, rows: timelineRows } = usePageRows(88, Boolean(data));
  const groupKey = (g: Group) => g.key;
  const matched = info.groups.find(g => groupKey(g) === selected) ?? null;
  const timeline = matched
    ? info.timeline.filter(c => c.groupKey === matched.key)
    : info.timeline;
  useEffect(() => {
    setGroupPage(0);
    setTimelinePage(0);
    setSelected(null);
  }, [data.meta.generatedAt, data.machine.id]);

  const groupPages = Math.max(1, Math.ceil(info.groups.length / groupRows));
  const historyPages = Math.max(1, Math.ceil(timeline.length / timelineRows));
  const safeGroupPage = Math.min(groupPage, groupPages - 1);
  const safeHistoryPage = Math.min(timelinePage, historyPages - 1);
  const date = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: data.meta.timeZone,
  }).format(new Date(iso));

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="grid grid-cols-6 gap-2">
        {[
          ["Concluídos classificados", stats.diagnosedFinishedCalls],
          ["Repetições ≤24h", stats.repeated24h],
          ["Repetições ≤7d", stats.repeated7d],
          ["Repetições ≤30d", stats.repeated30d],
          ["Mesmo conjunto ≤30d", stats.repeatedSet30d],
          ["Mesmo subconjunto ≤30d", stats.repeatedSubset30d],
        ].map(([title, count], i) => (
          <div key={title} className={`min-w-0 rounded-lg border p-3 ${
            i >= 4 ? "border-sky-500/25 bg-sky-500/[0.05]" : "border-border bg-card"
          }`}>
            <p className="truncate text-[9px] font-black uppercase text-muted-foreground" title={String(title)}>{title}</p>
            <p className="mt-1 text-xl font-black tabular-nums">{count}</p>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-3">
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3">
          <div className="flex shrink-0 items-center gap-2">
            <Layers3 className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-black uppercase">Conjuntos e subconjuntos</h3>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Selecione para filtrar ocorrências · repetição exige diagnóstico e localização idênticos</p>
          <div ref={groupViewport} className="mt-2 min-h-0 flex-1 overflow-hidden">
            {info.groups.slice(safeGroupPage * groupRows, (safeGroupPage + 1) * groupRows).map(group => (
              <button type="button" key={groupKey(group)}
                onClick={() => {
                  setSelected(selected === groupKey(group) ? null : groupKey(group));
                  setTimelinePage(0);
                }}
                className={`flex h-[70px] w-full flex-col justify-center gap-1 border-b border-border/50 px-2 text-left last:border-b-0 hover:bg-muted/30 ${
                  selected === groupKey(group) ? "bg-sky-500/10 ring-1 ring-sky-500/30" : ""
                }`}>
                <div className="flex justify-between gap-2 text-[11px] font-bold">
                  <span className="truncate">{group.setName ?? "Conjunto não identificado"} → {group.subsetName ?? "Subconjunto não identificado"}</span>
                  <span className="shrink-0 tabular-nums text-red-300">{group.repeatsSet30d} conj. · {group.repeats30d} sub.</span>
                </div>
                <p className="truncate text-[10px] text-muted-foreground">{classificationLabels.get(group.classification) ?? group.classification}</p>
                <p className="text-[9px] text-muted-foreground">{group.calls} concluído(s) na janela</p>
              </button>
            ))}
            {!info.groups.length && <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Nenhuma conclusão classificada nesta janela.</div>}
          </div>
          <Page page={safeGroupPage} pages={groupPages} total={info.groups.length} change={setGroupPage}/>
          {info.groupsTruncated && <p className="text-[9px] text-amber-300">Exibindo os 40 grupos mais relevantes.</p>}
        </section>
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400"/>
              <h3 className="text-xs font-black uppercase">Linha do tempo de diagnósticos</h3>
            </div>
            {selected && <button type="button" onClick={() => {setSelected(null);setTimelinePage(0);}}
              className="rounded border border-border px-2 py-1 text-[10px] hover:bg-muted">Limpar filtro</button>}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Chamados finalizados · diagnóstico não significa causa raiz nem parada física</p>
          <div ref={timelineViewport} className="mt-2 min-h-0 flex-1 overflow-hidden">
            {timeline.slice(safeHistoryPage * timelineRows, (safeHistoryPage + 1) * timelineRows).map(c => (
              <div key={c.callId} className="flex h-[88px] flex-col justify-center gap-1 border-b border-border/50 px-1 last:border-b-0">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <b>{date(c.finishedAt)}</b>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                    c.repeatSubset30d ? "border-red-500/40 bg-red-500/10 text-red-300" :
                      c.repeat30d ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-border text-muted-foreground"
                  }`}>
                    {c.repeatSubset30d ? "Mesmo subconjunto" : c.repeatSet30d ? "Mesmo conjunto" : c.repeat30d ? "Diagnóstico repetido" : "Sem antecedente ≤30d"}
                  </span>
                </div>
                <p className="truncate text-[10px]" title={c.description ?? undefined}>
                  {classificationLabels.get(c.classification) ?? c.classification} · {c.description ?? "Sem descrição"}
                </p>
                <p className="truncate text-[9px] text-muted-foreground">{c.setName ?? "Conjunto —"} / {c.subsetName ?? "Subconjunto —"} · OS {c.workOrderNumber ?? "—"}</p>
                <p className="flex items-center justify-between gap-1 text-[9px] text-muted-foreground">
                  <span title={c.callId} className="truncate">Chamado {c.callId} · anterior {formatHours(c.previousDiagnosisHours)}</span>
                  <span className="inline-flex shrink-0 items-center gap-1"><RotateCcw className="h-3 w-3"/>{c.returnCycles} retorno(s)</span>
                </p>
              </div>
            ))}
            {!timeline.length && <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Nenhum chamado encontrado nesta seleção.</div>}
          </div>
          <Page page={safeHistoryPage} pages={historyPages} total={timeline.length} change={setTimelinePage}/>
          <p className="shrink-0 text-[9px] text-muted-foreground">
            Com conjunto: {stats.withSetSnapshot}/{stats.diagnosedFinishedCalls}; com subconjunto: {stats.withSubsetSnapshot}/{stats.diagnosedFinishedCalls}.
            {info.timelineTruncated ? ` Exibindo últimas ${info.timeline.length} de ${info.totalTimelineCases} ocorrências.` : ""}
          </p>
        </section>
      </div>
    </div>
  );
}
