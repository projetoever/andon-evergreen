import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage } from "@/i18n/LanguageProvider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Maximize2 } from "lucide-react";
import { BiChartAlternative } from "@/components/bi/BiChartAlternative";
import { availableBiChartModes, type BiChartKind, type BiChartMode } from "@/components/bi/biChartModePolicy";
import { useMemo, useRef, useState, type ReactNode } from "react";

export type BiChartRow = {
  id: string;
  label: string;
  value: number | null;
  details?: Array<{ label: string; value: string }>;
};

type BiChartExplorerProps = {
  title: string;
  description: string;
  rows: BiChartRow[];
  unit: "minutes" | "percent" | "count";
  color: string;
  orientation?: "vertical" | "horizontal";
  chartKind?: BiChartKind;
  className?: string;
  caution: string;
  children?: ReactNode;
  launcher?: boolean;
  allowRank?: boolean;
  onInspectRow?: (row: BiChartRow) => void;
};

/** These values are the existing authorized BI snapshot; no new API or aggregate is requested. */
function formatValue(value: number | null, unit: BiChartExplorerProps["unit"]) {
  if (value === null || !Number.isFinite(value)) return ui("Sem amostra");
  const locale = getInterfaceLocale();
  if (unit === "percent")
    return `${value.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  if (unit === "count") return value.toLocaleString(locale, { maximumFractionDigits: 0 });
  const rounded = Math.max(0, Math.round(value));
  const hours = Math.floor(rounded / 60);
  return hours
    ? `${hours.toLocaleString(locale)}${ui("h")}${rounded % 60 ? ` ${rounded % 60}${ui("min")}` : ""}`
    : `${rounded}${ui("min")}`;
}

/** Spreadsheet formula injection protection applies even when labels come from internal catalogs. */
function csvCell(value: string) {
  const neutralized = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function BiChartExplorer({
  title,
  description,
  rows,
  unit,
  color,
  orientation = "vertical",
  chartKind,
  className = "",
  caution,
  children,
  launcher = false,
  allowRank = false,
  onInspectRow,
}: BiChartExplorerProps) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const drilldownNavigationRef = useRef(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [chartMode, setChartMode] = useState<BiChartMode>("bars");
  const [ranked, setRanked] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const kind = chartKind ?? (orientation === "horizontal" ? "categorical" : "temporal");
  const chartModes = useMemo(() => availableBiChartModes(rows, unit, kind), [rows, unit, kind]);
  const activeMode = chartModes.includes(chartMode) ? chartMode : "bars";
  const displayRows = useMemo(
    () => ranked && allowRank
      ? [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
      : rows,
    [allowRank, ranked, rows],
  );
  const validRows = rows.filter((row) => row.value !== null && Number.isFinite(row.value));
  const highest = validRows.reduce<BiChartRow | null>(
    (best, row) => (!best || row.value! > best.value! ? row : best), null,
  );
  const lowest = validRows.reduce<BiChartRow | null>(
    (best, row) => (!best || row.value! < best.value! ? row : best), null,
  );
  const total = validRows.reduce((sum, row) => sum + row.value!, 0);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedShare =
    unit === "percent" || !selected || selected.value === null || total <= 0
      ? null
      : (100 * selected.value) / total;

  const openExplorer = () => {
    setView("chart");
    setSelectedId(null);
    setOpen(true);
  };

  const exportCsv = () => {
    const header = [ui("Categoria"), ui("Valor"), ui("Unidade")];
    const unitLabel = unit === "minutes" ? ui("min") : unit === "percent" ? "%" : ui("chamados");
    const lines = [
      header.map(csvCell).join(","),
      ...displayRows.map((row) =>
        [row.label, row.value === null ? "" : String(row.value), unitLabel]
          .map(csvCell).join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "andon-bi-grafico.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {launcher ? (
        <button type="button" ref={expandButtonRef} onClick={openExplorer}
          aria-haspopup="dialog" aria-label={ui("Ampliar análise do gráfico: {0}",{0:title})}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true"/> {ui("Explorar gráficos")}
        </button>
      ) : (<div className={`relative min-w-0 ${className}`}>
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label={ui("Ampliar análise do gráfico: {0}", { 0: title })}
          onClick={openExplorer}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openExplorer();
            }
          }}
          className="h-full min-w-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {children}
        </div>
        <button
          type="button"
          ref={expandButtonRef}
          aria-label={ui("Ampliar análise do gráfico: {0}", { 0: title })}
          title={ui("Abrir análise ampliada")}
          onClick={openExplorer}
          className="absolute right-1 top-1 z-10 rounded-md border border-border bg-background/95 p-1.5 shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>)}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!drilldownNavigationRef.current) expandButtonRef.current?.focus();
            drilldownNavigationRef.current = false;
          }}
          className="flex max-h-[94dvh] w-[min(96vw,1080px)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:p-5"
        >
          <DialogHeader className="shrink-0 pr-9 text-left">
            <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">{description}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">{ui("Pontos com dados")}</p>
                <p className="text-lg font-bold tabular-nums">
                  {validRows.length}/{rows.length}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground">{ui("Maior valor observado")}</p>
                <p className="text-base font-bold tabular-nums">{formatValue(highest?.value ?? null, unit)}</p>
                <p className="truncate text-xs text-muted-foreground" title={highest?.label}>{highest?.label ?? "—"}</p>
              </div>
              <div className="col-span-2 rounded-lg border border-border bg-muted/20 p-3 sm:col-span-1">
                <p className="text-[11px] text-muted-foreground">{ui("Menor valor observado")}</p>
                <p className="text-base font-bold tabular-nums">{formatValue(lowest?.value ?? null, unit)}</p>
                <p className="truncate text-xs text-muted-foreground" title={lowest?.label}>{lowest?.label ?? "—"}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div role="group" aria-label={ui("Modo de exploração")} className="inline-flex rounded-lg border border-border bg-muted/20 p-1">
                {(["chart", "table"] as const).map((mode) => (
                  <button key={mode} type="button" aria-pressed={view === mode}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setView(mode)}>
                    {mode === "chart" ? ui("Gráfico") : ui("Tabela de dados")}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {allowRank && (
                  <button type="button" aria-pressed={ranked}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                    onClick={() => setRanked((current) => !current)}>
                    {ranked ? ui("Ordem original") : ui("Ordenar por valor")}
                  </button>
                )}
                <button type="button" onClick={exportCsv} disabled={!rows.length}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40">
                  <Download aria-hidden="true" className="h-3.5 w-3.5" />
                  {ui("Exportar dados CSV")}
                </button>
              </div>
            </div>
            {view === "chart" && (
              <div role="group" aria-label={ui("Tipo de gráfico")} className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/20 p-1">
                {chartModes.map(mode => <button type="button" key={mode} aria-pressed={activeMode === mode}
                  onClick={() => {setChartMode(mode);setSelectedId(null);}}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${activeMode === mode ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>
                  {ui(({bars:"Barras",line:"Linha",area:"Área",donut:"Rosca",pie:"Disco",pareto:"Pareto"} as const)[mode])}</button>)}
              </div>
            )}
            {view === "chart" ? (
              <div className="min-w-0 rounded-lg border border-border bg-card p-2 sm:p-3">
                <div className="max-h-[44dvh] min-w-0 overflow-y-auto">
                  <div className="min-h-[240px] min-w-0"
                    style={{ height: orientation === "horizontal" ? Math.max(320, displayRows.length * 36) : 380 }}>
                  {validRows.length ? (activeMode !== "bars" ? (
                    <BiChartAlternative mode={activeMode} rows={displayRows} unit={unit} color={color}
                      selectedId={selectedId} onSelect={setSelectedId} formatValue={value => formatValue(value, unit)} />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={displayRows}
                        layout={orientation === "horizontal" ? "vertical" : "horizontal"}
                        margin={{ left: orientation === "horizontal" ? 12 : 2, right: 12, top: 12, bottom: 4 }}
                        onClick={(state) => {
                          const payload = state?.activePayload?.[0]?.payload as BiChartRow | undefined;
                          if (payload?.id) setSelectedId(payload.id);
                        }}
                      >
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={orientation !== "horizontal"} horizontal={orientation === "horizontal"} />
                        {orientation === "horizontal" ? (
                          <>
                            <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                              tickFormatter={(v) => formatValue(Number(v), unit)} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="label" width={118}
                              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          </>
                        ) : (
                          <>
                            <XAxis dataKey="label" minTickGap={9}
                              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis width={54} domain={unit === "percent" ? [0, 100] : [0, "auto"]}
                              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                              tickFormatter={(v) => formatValue(Number(v), unit)} axisLine={false} tickLine={false} />
                          </>
                        )}
                        <Tooltip formatter={(v) => [formatValue(Number(v), unit), title]}
                          contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", borderRadius: 10 }} />
                        <Bar dataKey="value" fill={color} maxBarSize={orientation === "horizontal" ? 45 : 35}
                          radius={orientation === "horizontal" ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
                          {displayRows.map((row) => (
                            <Cell key={row.id} fill={color} fillOpacity={selectedId && selectedId !== row.id ? 0.3 : 0.92} cursor="pointer" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{ui("Sem amostra")}</div>
                  )}
                  </div>
                </div>
                <p className="pt-1 text-center text-[11px] text-muted-foreground">{ui("Selecione um ponto ou categoria para inspecionar seus valores.")}</p>
                {(activeMode === "pie" || activeMode === "donut") && <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 text-[11px]">{displayRows.filter(r => r.value !== null && r.value > 0).map(r => <button type="button" key={r.id} onClick={() => setSelectedId(r.id)} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-left hover:bg-muted"><span className="truncate">{r.label}</span><span className="shrink-0 tabular-nums">{formatValue(r.value,unit)} · {(100*r.value!/total).toFixed(1)}%</span></button>)}</div>}
                {(activeMode === "line" || activeMode === "area") && <p className="pt-1 text-[11px] text-muted-foreground">{ui("A linha conecta intervalos observados, não comprova evolução contínua. Os dias de borda podem ser parciais.")}</p>}
                {activeMode === "pareto" && <p className="pt-1 text-[11px] text-muted-foreground">{ui("Barras ordenadas por contribuição; curva acumulada e linha de referência de 80%.")}</p>}
              </div>
            ) : (
              <div className="max-h-[44dvh] overflow-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr><th scope="col" className="px-3 py-2">{ui("Categoria")}</th><th scope="col" className="px-3 py-2 text-right">{ui("Valor")}</th></tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="p-0"><button type="button" onClick={() => setSelectedId(row.id)}
                          className="w-full p-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row.label}</button></td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatValue(row.value, unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <section className="rounded-lg border border-border bg-muted/20 p-3" aria-label={ui("Inspeção do ponto")}>
                <h3 className="text-xs font-bold uppercase tracking-wide">{ui("Inspeção do ponto")}</h3>
                {selected ? (
                  <>
                    <p className="mt-2 font-semibold">{selected.label}: {formatValue(selected.value, unit)}</p>
                    {selectedShare !== null && <p className="mt-1 text-xs text-muted-foreground">
                      {ui("{0}% do total dos pontos exibidos", {
                        0: selectedShare.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 1 }),
                      })}
                    </p>}
                    {selected.details?.map((item) => (
                      <p key={item.label} className="mt-1 text-xs text-muted-foreground">{item.label}: {item.value}</p>
                    ))}
                    {onInspectRow && (
                      <button type="button" onClick={() => { drilldownNavigationRef.current = true; setOpen(false); onInspectRow(selected); }}
                        className="mt-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                        {ui("Abrir detalhamento da máquina")}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{ui("Selecione uma barra ou linha da tabela.")}</p>
                )}
              </section>
              <section className="rounded-lg border border-border bg-muted/20 p-3">
                <h3 className="text-xs font-bold uppercase tracking-wide">{ui("Como interpretar")}</h3>
                <p className="mt-2 text-xs leading-5">{caution}</p>
                <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                  {ui("Máximos e mínimos descrevem os pontos exibidos, não demonstram causa ou tendência.")}
                </p>
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
