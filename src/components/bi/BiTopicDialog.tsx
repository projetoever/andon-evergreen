import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import type { AnalyticsDrilldownSelection, AnalyticsOverview } from "@/types/analytics";
import { buildBiTopicDetail, type BiDetailTopic } from "@/utils/biTopicDetails";

const PAGE_SIZE = 7;

export function BiTopicDialog({
  topic,
  overview,
  filterSummary,
  classificationLabels,
  sectorLabels,
  onClose,
  onDrilldown,
}: {
  topic: BiDetailTopic;
  overview: AnalyticsOverview;
  filterSummary: string;
  classificationLabels: ReadonlyMap<string, string>;
  sectorLabels: ReadonlyMap<string, string>;
  onClose: () => void;
  onDrilldown: (selection: AnalyticsDrilldownSelection) => void;
}) {
  useLanguage();
  const detail = buildBiTopicDetail(topic, overview, classificationLabels, sectorLabels);
  const [view, setView] = useState<"basis" | "chart" | "data">(
    ["availability-daily", "downtime-daily", "machines", "classifications", "sectors"].includes(
      topic,
    ) && Boolean(detail.chart?.points.length)
      ? "chart"
      : "basis",
  );
  const [page, setPage] = useState(0);
  const previousFocus = useRef<HTMLElement | null>(null);
  const pendingSelection = useRef<AnalyticsDrilldownSelection | null>(null);
  const pages = Math.max(1, Math.ceil(detail.rows.length / PAGE_SIZE));
  const date = (value: string) =>
    new Intl.DateTimeFormat(getInterfaceLocale(), {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: overview.meta.timeZone,
    }).format(new Date(value));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          previousFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
          // Open the next dialog only after Radix restores focus. Otherwise its
          // delayed close callback could steal focus from the investigation.
          const selection = pendingSelection.current;
          pendingSelection.current = null;
          if (selection) onDrilldown(selection);
        }}
        className="flex h-[min(800px,calc(100dvh-24px))] w-[calc(100vw-24px)] max-w-6xl min-w-0 flex-col gap-3 overflow-hidden rounded-xl border-primary/30 bg-card p-4 sm:p-6"
      >
        <DialogHeader className="shrink-0 pr-7">
          <DialogTitle>{detail.title}</DialogTitle>
          <DialogDescription>
            {ui("Detalhamento do tópico · mesma consulta do painel")}
          </DialogDescription>
        </DialogHeader>
        <div className="shrink-0 rounded-lg border border-border bg-background/50 p-3 text-xs text-muted-foreground">
          <p className="break-words">{filterSummary}</p>
          <p className="mt-1">
            {date(overview.meta.period.start)} → {date(overview.meta.period.effectiveEnd)} ·{" "}
            {overview.meta.timeZone}
          </p>
          <p className="mt-1">
            {ui("Gerado em {0} · definição {1}", {
              0: date(overview.meta.generatedAt),
              1: overview.meta.metricDefinitionVersion,
            })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <strong className="text-2xl font-black tabular-nums">{detail.value}</strong>
          <div className="flex gap-1 rounded-lg border border-border p-1">
            <button
              type="button"
              aria-pressed={view === "basis"}
              onClick={() => setView("basis")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === "basis" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {ui("Base do indicador")}
            </button>
            <button
              type="button"
              aria-pressed={view === "chart"}
              onClick={() => setView("chart")}
              disabled={!detail.chart?.points.length}
              className={`rounded-md px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${view === "chart" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {ui("Gráfico")}
            </button>
            <button
              type="button"
              aria-pressed={view === "data"}
              onClick={() => setView("data")}
              disabled={!detail.rows.length}
              className={`rounded-md px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${view === "data" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {ui("Dados")}
            </button>
          </div>
        </div>
        {detail.notice && (
          <p
            role="status"
            className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200"
          >
            {detail.notice}
          </p>
        )}
        {view === "basis" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <p className="text-sm leading-6">{detail.definition}</p>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <h3 className="mb-1 text-xs font-bold uppercase text-muted-foreground">
                {ui("Cálculo")}
              </h3>
              <p className="text-sm font-semibold">{detail.formula}</p>
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {detail.inputs.map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border bg-background/40 p-3"
                >
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground">
              {ui(
                "Sem amostra válida, o valor permanece indisponível. Testes, falsos chamados e duplicados seguem a política comum do BI. Consulte as restrições específicas deste indicador.",
              )}
            </p>
          </div>
        ) : view === "chart" && detail.chart ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div
              className="min-h-0 flex-1 rounded-lg border border-border bg-background/30 p-2"
              aria-label={ui("Gráfico de {0}", { 0: detail.title })}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={detail.chart.points}
                  margin={{ left: 0, right: 8, bottom: 0, top: 4 }}
                >
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    minTickGap={30}
                  />
                  <YAxis
                    width={55}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    domain={detail.chart.unit === "%" ? [0, 100] : [0, "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                    }}
                    formatter={(value) => [
                      `${Number(value).toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 2 })} ${detail.chart!.unit}`,
                      detail.title,
                    ]}
                  />
                  <Bar
                    dataKey="value"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={45}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ui(
                "Datas operacionais; os dias das extremidades podem estar incompletos. Valores indisponíveis não são zero.",
              )}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            <div className="shrink-0 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">{detail.title}</caption>
                <thead className="bg-background/60 text-muted-foreground">
                  <tr>
                    {detail.columns.map((column) => (
                      <th key={column} scope="col" className="px-3 py-2 font-bold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {detail.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => (
                    <tr key={row.id}>
                      {row.cells.map((cell, index) => (
                        <td key={index} className="px-3 py-2 tabular-nums">
                          {index === 0 && row.selection ? (
                            <button
                              type="button"
                              onClick={() => {
                                pendingSelection.current = row.selection ?? null;
                                onClose();
                              }}
                              className="text-left font-bold text-primary underline-offset-4 hover:underline"
                              title={ui("Abrir registros de {0}", { 0: cell })}
                            >
                              {cell}
                            </button>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {ui("{0} linha(s) · página {1} de {2}", {
                  0: detail.rows.length,
                  1: page + 1,
                  2: pages,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  {ui("Anterior")}
                </button>
                <button
                  type="button"
                  disabled={page >= pages - 1}
                  onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}
                  className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                >
                  {ui("Próxima")}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {ui(
                "Datas operacionais; os dias das extremidades podem estar incompletos. Valores indisponíveis não são zero.",
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
