import { getInterfaceLocale, ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Layers3, RotateCcw, ShieldAlert } from "lucide-react";

import type { AnalyticsFailureIntelligence } from "@/types/analytics";

type FailureGroup = AnalyticsFailureIntelligence["groups"][number];
type FailureCase = FailureGroup["cases"][number];

function shortDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(getInterfaceLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function useVisibleRows(height: number, ready: boolean, reserve = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(3);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () =>
      setCount(Math.max(1, Math.floor(Math.max(0, element.clientHeight - reserve) / height)));
    resize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [height, ready, reserve]);

  return { ref, count };
}

function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  useInterfaceLanguage();
  return (
    <div className="flex h-8 shrink-0 items-center justify-between text-[10px] text-muted-foreground">
      <span>
        {total}
        {ui(" registro(s) · ")}
        {page + 1}/{pages}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={ui("Página anterior")}
          disabled={page === 0}
          onClick={() => onChange(Math.max(0, page - 1))}
          className="rounded border border-border bg-background p-1.5 hover:bg-muted disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label={ui("Próxima página")}
          disabled={page >= pages - 1}
          onClick={() => onChange(Math.min(pages - 1, page + 1))}
          className="rounded border border-border bg-background p-1.5 hover:bg-muted disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function Stat({
  title,
  value,
  detail,
  color,
}: {
  title: string;
  value: string;
  detail: string;
  color: "red" | "amber" | "blue" | "green";
}) {
  useInterfaceLanguage();
  const styles = {
    red: "border-red-500/30 bg-red-500/[0.05] text-red-300",
    amber: "border-amber-500/30 bg-amber-500/[0.05] text-amber-300",
    blue: "border-sky-500/30 bg-sky-500/[0.05] text-sky-300",
    green: "border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-300",
  }[color];

  return (
    <div className={`rounded-xl border px-3 py-2 ${styles}`}>
      <div className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>
    </div>
  );
}

export function BiFailureIntelligencePanel({
  data,
  loading,
  error,
  classificationLabels,
}: {
  data: AnalyticsFailureIntelligence | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
}) {
  useInterfaceLanguage();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [groupPage, setGroupPage] = useState(0);
  const [casePage, setCasePage] = useState(0);
  const { ref: groupViewport, count: groupRows } = useVisibleRows(72, Boolean(data));
  const { ref: caseViewport, count: caseRows } = useVisibleRows(105, Boolean(data));

  useEffect(() => {
    setGroupPage(0);
    setCasePage(0);
    setSelectedKey(null);
  }, [data]);

  if (loading && !data) {
    return <div className="h-full animate-pulse rounded-xl border border-border bg-card" />;
  }
  if (error) {
    return (
      <div className="h-full rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-xs text-amber-300">
        {ui("Não foi possível carregar a análise de reincidência: ")}
        {systemMessage(error)}
      </div>
    );
  }
  if (!data) return null;

  const groups = data.groups;
  const selectKey = (group: FailureGroup) =>
    JSON.stringify([group.machineId, group.classification]);
  const selected = groups.find((group) => selectKey(group) === selectedKey) ?? groups[0] ?? null;
  const totalGroupPages = Math.max(1, Math.ceil(groups.length / groupRows));
  const safeGroupPage = Math.min(groupPage, totalGroupPages - 1);
  const pageGroups = groups.slice(safeGroupPage * groupRows, (safeGroupPage + 1) * groupRows);
  const cases = selected?.cases ?? [];
  const totalCasePages = Math.max(1, Math.ceil(cases.length / caseRows));
  const safeCasePage = Math.min(casePage, totalCasePages - 1);
  const pageCases = cases.slice(safeCasePage * caseRows, (safeCasePage + 1) * caseRows);
  const tz = data.meta.timeZone;
  const numbers = data.totals;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div className="grid shrink-0 grid-cols-4 gap-3">
        <Stat
          title={ui("Repetições até 24h")}
          value={String(numbers.repeated24h)}
          detail={ui("Mesmo ativo e diagnóstico")}
          color="red"
        />
        <Stat
          title={ui("Repetições até 7 dias")}
          value={String(numbers.repeated7d)}
          detail={ui("Janela cumulativa")}
          color="amber"
        />
        <Stat
          title={ui("Repetições até 30 dias")}
          value={String(numbers.repeated30d)}
          detail={ui("{0} dos concluídos diagnosticados", {
            0: numbers.repeatRate30dPercent === null ? "—" : `${numbers.repeatRate30dPercent}%`,
          })}
          color="blue"
        />
        <Stat
          title={ui("Retornos à manutenção")}
          value={String(numbers.maintenanceReturnCycles)}
          detail={ui("{0} chamado(s) classificado(s) · métrica separada", {
            0: numbers.diagnosedFinishedCalls,
          })}
          color="green"
        />
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(300px,0.87fr)_minmax(0,1.13fr)]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h2 className="text-xs font-black uppercase tracking-wide">
                {ui("Diagnósticos recorrentes por máquina")}
              </h2>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {ui(
                "Ordenação por repetições em 30 dias; registros sem repetição também são consultáveis",
              )}
            </p>
          </div>

          <div ref={groupViewport} className="mt-2 min-h-0 flex-1 overflow-hidden">
            {pageGroups.map((group) => {
              const active = selected && selectKey(selected) === selectKey(group);
              return (
                <button
                  key={selectKey(group)}
                  type="button"
                  onClick={() => {
                    setSelectedKey(selectKey(group));
                    setCasePage(0);
                  }}
                  className={`flex h-[72px] w-full flex-col justify-center gap-1 border-b border-border/50 px-2 text-left transition last:border-b-0 hover:bg-muted/40 ${
                    active ? "rounded-md bg-red-500/[0.08] ring-1 ring-red-500/30" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-xs font-black">{group.machineName}</span>
                    <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-black tabular-nums text-red-300">
                      {group.repeats30d}
                      {ui(" rep. / 30d")}
                    </span>
                  </div>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {classificationLabels.get(group.classification) ?? group.classification}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {group.calls}
                    {ui(" concluído(s) · ")}
                    {group.repeats24h}
                    {ui(" em 24h · ")}
                    {group.returnCycles}
                    {ui(" retorno(s)")}
                  </span>
                </button>
              );
            })}
            {!groups.length && (
              <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground">
                {ui(
                  "Sem chamados finalizados com diagnóstico neste período. Nenhuma reincidência pode ser calculada.",
                )}
              </div>
            )}
          </div>

          <Pager
            page={safeGroupPage}
            pages={totalGroupPages}
            total={groups.length}
            onChange={setGroupPage}
          />
        </section>

        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-sky-400" />
              <h2 className="text-xs font-black uppercase tracking-wide">
                {ui("Histórico / linha do tempo")}
              </h2>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {selected
                ? ui("{0} · {1} · intervalo médio entre repetições: {2}h", {
                    0: selected.machineName,
                    1: classificationLabels.get(selected.classification) ?? selected.classification,
                    2: selected.averageRepeatGapHours ?? "—",
                  })
                : ui("Selecione uma máquina e diagnóstico para ver os chamados")}
            </p>
          </div>

          <div ref={caseViewport} className="mt-2 min-h-0 flex-1 overflow-hidden">
            {pageCases.map((item: FailureCase) => (
              <div
                key={item.callId}
                className="flex h-[105px] flex-col justify-center gap-1 border-b border-border/50 px-1 text-xs last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black">{shortDate(item.finishedAt, tz)}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${
                      item.repeat24h
                        ? "border-red-500/30 bg-red-500/10 text-red-300"
                        : item.repeat30d
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          : "border-border bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    {item.repeat24h
                      ? ui("Repetição ≤24h")
                      : item.repeat7d
                        ? ui("Repetição ≤7d")
                        : item.repeat30d
                          ? ui("Repetição ≤30d")
                          : ui("Sem antecedente ≤30d")}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
                  <Layers3 className="h-3 w-3 shrink-0" />
                  <span
                    className="truncate"
                    title={`${item.setName ?? ui("Sem conjunto")} / ${item.subsetName ?? ui("Sem subconjunto")}`}
                  >
                    {item.setName ?? ui("Sem conjunto")} →{" "}
                    {item.subsetName ?? ui("Sem subconjunto")}
                  </span>
                </div>
                <p className="truncate text-[10px]" title={item.description ?? undefined}>
                  {item.description ?? ui("Sem descrição estruturada")}
                </p>
                <div className="flex items-center justify-between gap-3 text-[9px] text-muted-foreground">
                  <span className="truncate" title={item.callId}>
                    {ui("OS: ")}
                    {item.workOrderNumber || "—"}
                    {ui(" · chamado ")}
                    {item.callId}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <RotateCcw className="h-3 w-3" /> {item.returnCycles}
                  </span>
                </div>
              </div>
            ))}
            {!selected && (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                {ui("Histórico indisponível sem chamados concluídos classificados.")}
              </div>
            )}
          </div>

          {selected && (
            <div className="shrink-0 border-t border-border pt-1 text-[9px] text-muted-foreground">
              {ui("Conjunto/subconjunto do snapshot histórico · ")}
              {data.coverage.withSetSnapshotPercent === null
                ? "—"
                : `${data.coverage.withSetSnapshotPercent}%`}
              {ui(" com conjunto identificado")}
              {selected.totalCases > cases.length
                ? ui(" · exibindo últimas {0} de {1} ocorrências", {
                    0: cases.length,
                    1: selected.totalCases,
                  })
                : ""}
            </div>
          )}
          <Pager
            page={safeCasePage}
            pages={totalCasePages}
            total={cases.length}
            onChange={setCasePage}
          />
        </section>
      </div>
    </div>
  );
}
