import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getInterfaceLocale, ui } from "@/i18n/translate";
import { BiChartAlternative } from "./BiChartAlternative";
import { availableBiChartModes, type BiChartMode } from "./biChartModePolicy";

type Item = { id: string; label: string; value: number | null };
type Props = {
  rows: Item[];
  unit: "minutes" | "percent" | "count";
  color: string;
  height?: number;
  allowComposition?: boolean;
  onInspect?: (id: string) => void;
};

/** Embedded, labeled plot, not a shortcut to a dialog.
 * All modes read the same rows. No server query or KPI mutation occurs.
 */
export function BiInlineDistributionChart({
  rows, unit, color, height = 250, allowComposition = true, onInspect,
}: Props) {
  const [mode, setMode] = useState<BiChartMode>("bars");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allowed = useMemo(() => allowComposition
    ? availableBiChartModes(rows, unit, "categorical")
    : (["bars"] as BiChartMode[]), [rows, unit, allowComposition]);
  const activeMode = allowed.includes(mode) ? mode : "bars";
  const valid = rows.filter(row => row.value !== null && Number.isFinite(row.value));
  const total = valid.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const format = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return ui("Sem amostra");
    if (unit === "count") return value.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 0 });
    if (unit === "percent") return value.toLocaleString(getInterfaceLocale(), { maximumFractionDigits: 1 }) + "%";
    const m = Math.round(value);
    return m >= 60 ? Math.floor(m / 60) + ui("h") + (m % 60 ? " " + (m % 60) + ui("min") : "") : m + ui("min");
  };
  const choose = (id: string) => {
    setSelectedId(id);
    onInspect?.(id);
  };
  if (!valid.length) return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">{ui("Sem amostra")}</div>;
  const maxLabelLength = Math.max(0, ...rows.map(row => row.label.length));
  const axisWidth = Math.min(134, Math.max(80, maxLabelLength * 6));
  return (
    <div className="min-w-0 space-y-2" data-bi-inline-chart="true">
      <div className="flex flex-wrap gap-1" role="group" aria-label={ui("Tipo de gráfico")}>
        {allowed.map(option => (
          <button type="button" key={option} aria-pressed={activeMode === option}
            className={"rounded-md border px-2.5 py-1 text-[11px] font-semibold transition " +
              (option === activeMode ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}
            onClick={() => { setMode(option); setSelectedId(null); }}>
            {ui(({ bars:"Barras", pareto:"Pareto", donut:"Rosca", pie:"Disco", line:"Linha", area:"Área" } as const)[option])}
          </button>
        ))}
      </div>
      <div style={{ height }} className="w-full min-w-0" role="img" aria-label={ui("Gráfico comparativo com escala e valores inspecionáveis")}>
        {activeMode === "bars" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 72, bottom: 12, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, "auto"]} tick={{ fill:"var(--muted-foreground)", fontSize:10 }}
                axisLine={false} tickLine={false}
                tickFormatter={(v) => unit === "minutes" ? (Number(v)/60).toFixed(0) + ui("h") : String(v)} />
              <YAxis type="category" dataKey="label" width={axisWidth}
                tick={{ fill:"var(--muted-foreground)", fontSize:11 }}
                tickFormatter={(v) => String(v).length > 19 ? String(v).slice(0, 18) + "…" : String(v)}
                axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [format(v == null ? null : Number(v)), ui("Valor observado")]}
                contentStyle={{ background:"var(--popover)", borderColor:"var(--border)", borderRadius:10 }} />
              <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={23}
                onClick={(row) => { const item=row as {id?:string;payload?:{id?:string}}; const id=item.payload?.id ?? item.id; if(id)choose(String(id)); }}>
                {rows.map(row => <Cell key={row.id} fill={color} fillOpacity={selectedId && selectedId !== row.id ? .35 : .94} cursor={onInspect ? "pointer" : "default"} />)}
                <LabelList dataKey="value" position="right" formatter={(v: unknown)=>format(v == null ? null : Number(v))} fill="var(--foreground)" fontSize={10}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <BiChartAlternative mode={activeMode} rows={rows} unit={unit} color={color}
            selectedId={selectedId} onSelect={choose} formatValue={format} />
        )}
      </div>
      {(activeMode === "donut" || activeMode === "pie") && total > 0 && (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {rows.filter(row => row.value !== null && row.value > 0).map(row => (
            <button key={row.id} type="button" onClick={() => choose(row.id)}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/30 px-2 py-1 text-left text-[11px] hover:bg-muted">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 tabular-nums">{(100 * row.value! / total).toFixed(1)}%</span>
            </button>
          ))}
        </div>
      )}
      {activeMode === "pareto" && (
        <p className="text-[11px] text-muted-foreground">{ui("Pareto: curva acumulada e referência de 80% do total exibido.")}</p>
      )}
    </div>
  );
}
