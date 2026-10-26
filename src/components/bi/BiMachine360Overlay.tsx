import { getInterfaceLocale, ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import { BiMachineRecurrence } from "@/components/bi/BiMachineRecurrence";
import { buildMachinePdfHtml } from "@/services/andonBiMachinePdfReport";
import { openReportPrintDialog } from "@/services/andonBiPdfReport";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileDown,
  Layers3,
  ShieldAlert,
  TimerReset,
  Wrench,
  X,
} from "lucide-react";

import type { AnalyticsMachine360 } from "@/types/analytics";

function duration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const total = Math.round(value);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours
    ? `${hours}${ui("h")}${minutes ? ` ${minutes}${ui("m")}` : ""}`
    : `${minutes} ${ui("min")}`;
}

function PanelMetric({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: "red" | "amber" | "blue" | "green";
}) {
  useInterfaceLanguage();
  const colors = {
    red: "border-red-500/35 bg-red-500/[0.07]",
    amber: "border-amber-500/35 bg-amber-500/[0.06]",
    blue: "border-sky-500/35 bg-sky-500/[0.06]",
    green: "border-emerald-500/35 bg-emerald-500/[0.06]",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[tone]}`}>
      <div className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-black tabular-nums">{value}</div>
      <div className="truncate text-[10px] text-muted-foreground" title={note}>
        {note}
      </div>
    </div>
  );
}

function Paging({
  page,
  pages,
  onPage,
  total,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (index: number) => void;
}) {
  useInterfaceLanguage();
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-t border-border pt-1 text-[11px] text-muted-foreground">
      <span>
        {total}
        {ui(" registro(s) · página ")}
        {page + 1}/{pages}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label={ui("Página anterior")}
          disabled={page === 0}
          onClick={() => onPage(Math.max(0, page - 1))}
          className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={ui("Próxima página")}
          disabled={page >= pages - 1}
          onClick={() => onPage(Math.min(pages - 1, page + 1))}
          className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function BiMachine360Overlay({
  machineName,
  data,
  loading,
  error,
  classificationLabels,
  onClose,
}: {
  machineName: string;
  data: AnalyticsMachine360 | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
  onClose: () => void;
}) {
  useInterfaceLanguage();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [activeView, setActiveView] = useState<"overview" | "recurrence">("overview");
  const [visibleRows, setVisibleRows] = useState(3);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [onClose]);

  useEffect(() => {
    setPage(0);
    setActiveView("overview");
  }, [data?.machine.id, data?.meta.generatedAt]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => setVisibleRows(Math.max(1, Math.floor(viewport.clientHeight / 88)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [data, activeView]);

  const items = data?.timeline.items ?? [];
  const pages = Math.max(1, Math.ceil(items.length / visibleRows));
  const safePage = Math.min(page, pages - 1);
  const pageItems = items.slice(safePage * visibleRows, (safePage + 1) * visibleRows);
  const timeZone = data?.meta.timeZone ?? "America/Sao_Paulo";
  const localTime = (value: string) =>
    new Intl.DateTimeFormat(getInterfaceLocale(), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(value));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={ui("Machine 360 · {0}", { 0: machineName })}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="flex h-[calc(100dvh-24px)] w-full max-w-[1620px] min-h-0 flex-col gap-3 overflow-y-auto lg:overflow-hidden rounded-xl border border-emerald-500/30 bg-background p-4 shadow-2xl">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-emerald-300">
              <Activity className="h-4 w-4" />
              {ui(" Confiabilidade por ativo")}
            </div>
            <h2 className="mt-1 text-2xl font-black">
              {ui("Machine 360 · ")}
              {data?.machine.name ?? machineName}
            </h2>
            <p className="text-xs text-muted-foreground">
              {ui(
                "Registros do ambiente consultado · período do BI · parada física sem dupla contagem",
              )}
              {data?.meta.filters.classification
                ? ui(" · ativos atuais independem da classificação")
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && !loading && !error && (
              <button
                type="button"
                onClick={() =>
                  openReportPrintDialog(buildMachinePdfHtml(data, classificationLabels))
                }
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 text-xs font-black text-amber-200 hover:bg-amber-500/20"
                title={ui("Salvar relatório individual da máquina como PDF pelo navegador")}
              >
                <FileDown className="h-4 w-4" />
                {ui(" Exportar PDF")}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              autoFocus
              title={ui("Fechar (Esc)")}
              aria-label={ui("Fechar Machine 360")}
              className="rounded-lg border border-border bg-card p-2 transition hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {loading && (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {ui("Carregando ficha do ativo…")}
          </div>
        )}
        {error && !loading && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {ui("Não foi possível carregar a ficha: ")}
            {systemMessage(error)}
          </div>
        )}
        {!loading && !error && data && (
          <>
            <div className="grid shrink-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <PanelMetric
                label={ui("Downtime físico")}
                value={duration(data.kpis.downtimeMinutes)}
                note={ui("União dos eventos de parada")}
                tone="red"
              />
              <PanelMetric
                label={ui("Episódios")}
                value={String(data.kpis.physicalStopEpisodes)}
                note={ui("Episódios físicos unidos")}
                tone="red"
              />
              <PanelMetric
                label={ui("Parada / episódio")}
                value={duration(data.kpis.avgDowntimePerEpisodeMinutes)}
                note={ui("Inclui eventos ainda abertos")}
                tone="amber"
              />
              <PanelMetric
                label={ui("Intervalo entre paradas (calendário)")}
                value={data.machine.isActive ? duration(data.kpis.mtbfEstimatedMinutes) : "—"}
                note={ui(
                  "Indisponível sem exposição fora das paradas; não equivale a horas produtivas",
                )}
                tone="green"
              />
              <PanelMetric
                label={ui("MTTA")}
                value={duration(data.kpis.mttaMinutes)}
                note={ui("Abertura até primeiro atendimento")}
                tone="blue"
              />
              <PanelMetric
                label={ui("Atendimento técnico médio")}
                value={duration(data.kpis.avgMaintenanceMinutes)}
                note={ui("Tempo do fluxo, incluindo apoio a outras áreas")}
                tone="blue"
              />
            </div>

            <div className="grid shrink-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <span className="text-muted-foreground">{ui("Chamados abertos")}</span>
                <strong className="ml-2 tabular-nums">{data.kpis.callsOpened}</strong>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <span className="text-muted-foreground">{ui("Concluídos")}</span>
                <strong className="ml-2 tabular-nums">{data.kpis.callsFinished}</strong>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] px-3 py-2 text-xs">
                <span className="text-muted-foreground">{ui("Ativos agora")}</span>
                <strong className="ml-2 tabular-nums">{data.kpis.callsActiveNow}</strong>
              </div>
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <span className="text-muted-foreground">{ui("Sessões técnicas")}</span>
                <strong className="ml-2 tabular-nums">{data.kpis.activeSessionsNow}</strong>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-xs">
                <span className="text-muted-foreground">{ui("Retornos")}</span>
                <strong className="ml-2 tabular-nums">{data.kpis.maintenanceReturnCycles}</strong>
              </div>
            </div>

            <nav
              className="grid shrink-0 grid-cols-2 gap-2 rounded-lg border border-border bg-card p-1"
              aria-label={ui("Seções Machine 360")}
            >
              <button
                type="button"
                aria-pressed={activeView === "overview"}
                onClick={() => setActiveView("overview")}
                className={`rounded-md px-3 py-2 text-xs font-black uppercase transition ${activeView === "overview" ? "bg-sky-500/15 text-sky-300" : "text-muted-foreground hover:bg-muted"}`}
              >
                {ui("Visão da máquina")}
              </button>
              <button
                type="button"
                aria-pressed={activeView === "recurrence"}
                onClick={() => setActiveView("recurrence")}
                className={`rounded-md px-3 py-2 text-xs font-black uppercase transition ${activeView === "recurrence" ? "bg-amber-500/15 text-amber-200" : "text-muted-foreground hover:bg-muted"}`}
              >
                {ui("Reincidências e componentes")}
              </button>
            </nav>
            {activeView === "overview" ? (
              <div className="grid min-w-0 shrink-0 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] gap-3">
                <div className="grid min-w-0 lg:min-h-0 lg:grid-rows-3 gap-3">
                  <article className="min-h-0 overflow-hidden rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      {ui(" Diagnósticos dos concluídos")}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs">
                      {data.diagnoses.slice(0, 3).map((item) => (
                        <div key={item.classification} className="flex justify-between gap-2">
                          <span className="truncate">
                            {classificationLabels.get(item.classification) ?? item.classification}
                          </span>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                      {!data.diagnoses.length && (
                        <span className="text-muted-foreground">
                          {ui("Sem diagnósticos concluídos no período")}
                        </span>
                      )}
                    </div>
                  </article>
                  <article className="min-h-0 overflow-hidden rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                      <Layers3 className="h-4 w-4 text-sky-400" />
                      {ui(" Conjuntos e subconjuntos")}
                    </div>
                    <div className="mt-2 grid gap-1 text-xs">
                      {data.assets.slice(0, 3).map((item, index) => (
                        <div key={index} className="flex justify-between gap-2">
                          <span
                            className="truncate"
                            title={`${item.setName ?? ui("Não informado")} / ${item.subsetName ?? ui("Não informado")}`}
                          >
                            {item.setName ?? ui("Sem conjunto")} →{" "}
                            {item.subsetName ?? ui("Sem subconjunto")}
                          </span>
                          <strong>{item.calls}</strong>
                        </div>
                      ))}
                      {!data.assets.length && (
                        <span className="text-muted-foreground">
                          {ui("Sem localização histórica registrada")}
                        </span>
                      )}
                    </div>
                  </article>
                  <article className="min-h-0 overflow-hidden rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                      {ui(" Saúde dos registros")}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <span>
                        {ui("Evento(s) abertos: ")}
                        <strong>{data.dataHealth.openFailureEvents}</strong>
                      </span>
                      <span>
                        {ui("Mais antigo: ")}
                        <strong>{duration(data.dataHealth.oldestOpenFailureMinutes)}</strong>
                      </span>
                      <span>
                        {ui("Chamado mais antigo: ")}
                        <strong>{duration(data.dataHealth.oldestActiveCallMinutes)}</strong>
                      </span>
                      <span>
                        {ui("Sem classificação: ")}
                        <strong>{data.dataHealth.finishedWithoutClassification}</strong>
                      </span>
                    </div>
                  </article>
                </div>

                <article className="flex min-h-0 flex-col rounded-lg border border-border bg-card p-3">
                  <div className="flex shrink-0 items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                        <Clock3 className="h-4 w-4 text-sky-400" />
                        {ui(" Linha do tempo")}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {ui("Chamados e eventos físicos separados · até 40 ocorrências recentes")}
                      </p>
                    </div>
                    <TimerReset className="h-4 w-4 text-red-400" />
                  </div>

                  <div ref={viewportRef} className="mt-2 h-80 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
                    {pageItems.map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        className="flex h-[88px] flex-col justify-center gap-1 border-b border-border/60 px-1 text-xs last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black">{localTime(item.occurredAt)}</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                              item.kind === "failure_event"
                                ? "border-red-500/30 bg-red-500/10 text-red-300"
                                : "border-sky-500/30 bg-sky-500/10 text-sky-300"
                            }`}
                          >
                            {item.kind === "failure_event" ? ui("Evento físico") : ui("Chamado")}
                          </span>
                        </div>
                        <span className="truncate text-xs" title={item.description ?? undefined}>
                          {item.description ?? ui("Sem descrição")} ·{" "}
                          {item.classification
                            ? (classificationLabels.get(item.classification) ?? item.classification)
                            : ui("Sem classificação")}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {ui("OS: ")}
                          {item.workOrderNumber ?? "—"} · {item.setName ?? ui("sem conjunto")} /{" "}
                          {item.subsetName ?? ui("sem subconjunto")}
                        </span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {item.kind === "failure_event"
                            ? ui("Parada recortada: {0}", { 0: duration(item.durationMinutes) })
                            : ui("ID do chamado: {0}", { 0: item.callId })}
                        </span>
                      </div>
                    ))}
                    {!items.length && (
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {ui("Nenhum chamado ou evento físico no período")}
                      </div>
                    )}
                  </div>
                  <Paging
                    page={safePage}
                    pages={pages}
                    onPage={setPage}
                    total={data.timeline.total}
                  />
                  {data.timeline.truncated && (
                    <p className="shrink-0 text-[10px] text-amber-300">
                      {ui("Exibindo as últimas 40 ocorrências; os KPIs usam todos os registros.")}
                    </p>
                  )}
                </article>
              </div>
            ) : (
              <div className="shrink-0 min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                <BiMachineRecurrence data={data} classificationLabels={classificationLabels} />
              </div>
            )}
            <footer className="shrink-0 border-t border-border pt-2 text-[10px] text-muted-foreground">
              {ui("Máquina: ")}
              {data.machine.machineStatus}
              {ui(" · produção: ")}
              {data.machine.productionMode}
              {ui(" · sem alteração operacional · Esc para fechar")}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
