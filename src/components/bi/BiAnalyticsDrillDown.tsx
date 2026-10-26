import { getInterfaceLocale, ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { AnalyticsDrilldownResult, AnalyticsDrilldownSelection } from "@/types/analytics";

const PAGE_SIZE = 7;

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} ${ui("min")}`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}${ui("h")} ${minutes}${ui("m")}` : `${hours}${ui("h")}`;
}

export function BiAnalyticsDrillDown({
  selection,
  result,
  loading,
  error,
  classificationLabels,
  sectorLabels,
  onClose,
}: {
  selection: AnalyticsDrilldownSelection;
  result: AnalyticsDrilldownResult | null;
  loading: boolean;
  error: string | null;
  classificationLabels: Map<string, string>;
  sectorLabels: Map<string, string>;
  onClose: () => void;
}) {
  useInterfaceLanguage();
  const [page, setPage] = useState(0);
  const timeZone = result?.meta.timeZone ?? "America/Sao_Paulo";

  useEffect(() => {
    setPage(0);
  }, [selection.dimension, selection.value, result]);

  const totalPages = Math.max(1, Math.ceil((result?.items.length ?? 0) / PAGE_SIZE));
  const items = useMemo(
    () => result?.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) ?? [],
    [page, result],
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-primary/40 bg-card p-5 shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide">
            {ui("Drill-down · ")}
            {selection.label}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {ui("Registros analíticos que sustentam o ponto selecionado")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          title={ui("Fechar (Esc)")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background transition hover:bg-muted"
          aria-label={ui("Fechar detalhamento")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {ui("Carregando registros…")}
        </div>
      )}

      {error && !loading && (
        <div className="mt-4 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm">
          {systemMessage(error)}
        </div>
      )}

      {!loading &&
        !error &&
        result &&
        (result.items.length ? (
          <>
            <div className="mt-4 min-h-0 min-w-0 flex-1 overflow-auto lg:overflow-hidden rounded-lg border border-border">
              <table className="w-full min-w-[48rem] lg:min-w-0 table-fixed text-left text-xs">
                <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-[12%] px-3 py-2">{ui("Ocorrência")}</th>
                    <th className="w-[13%] px-3 py-2">{ui("Máquina")}</th>
                    <th className="w-[12%] px-3 py-2">{ui("Setor")}</th>
                    <th className="w-[15%] px-3 py-2">{ui("Classificação")}</th>
                    <th className="w-[10%] px-3 py-2">{ui("Duração")}</th>
                    <th className="w-[16%] px-3 py-2">{ui("OS / chamado")}</th>
                    <th className="px-3 py-2">{ui("Descrição")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={`${item.kind}-${item.id}`} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Intl.DateTimeFormat(getInterfaceLocale(), {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone,
                        }).format(new Date(item.occurredAt))}
                      </td>
                      <td className="truncate px-3 py-2 font-semibold" title={item.machineName}>
                        {item.machineName}
                      </td>
                      <td className="truncate px-3 py-2">
                        {item.subtype ? (sectorLabels.get(item.subtype) ?? item.subtype) : "—"}
                      </td>
                      <td className="truncate px-3 py-2">
                        {item.classification
                          ? (classificationLabels.get(item.classification) ?? item.classification)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">
                        {item.kind === "call" && !item.endedAt ? (
                          <span
                            title={ui(
                              "Chamado em andamento; ainda não possui duração final consolidada",
                            )}
                            className="text-amber-300"
                          >
                            {ui("Em aberto")}
                          </span>
                        ) : (
                          formatMinutes(item.durationMinutes)
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="truncate">{item.workOrderNumber || ui("Sem OS")}</div>
                        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                          {item.callId || ui("evento sem chamado")}
                        </div>
                      </td>
                      <td
                        className="truncate px-3 py-2 text-muted-foreground"
                        title={item.description ?? ui("Sem descrição")}
                      >
                        {item.description || ui("Sem descrição")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap gap-2 items-center justify-between text-xs text-muted-foreground">
              <span>
                {result.items.length}
                {ui(" registro(s) · página ")}
                {page + 1}/{totalPages}
                {ui(" · Esc para fechar")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-bold text-foreground disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {ui("Anterior")}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-bold text-foreground disabled:opacity-40"
                >
                  {ui("Próxima")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {ui("Nenhum registro encontrado para este detalhamento")}
          </div>
        ))}
    </section>
  );
}
