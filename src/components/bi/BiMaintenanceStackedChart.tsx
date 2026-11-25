import { useId } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { biChartGradientId, biChartGridColor, biChartTooltipStyle } from "./biChartVisualTheme";
import { getInterfaceLocale, ui } from "@/i18n/translate";

export type TechnicalEffortChartRow = {
  id: string;
  label: string;
  maintenanceMinutes: number;
  followUpMinutes: number;
  totalPersonMinutes: number;
  detail?: string;
};
function duration(value: number) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const h = Math.floor(total / 60);
  return h > 0 ? h + ui("h") + (total % 60 ? " " + total % 60 + ui("min") : "")
    : total + ui("min");
}
/** Chart values are person-minutes, not physical machine downtime. */
export function BiMaintenanceStackedChart({ rows, height = 265 }: {
  rows: TechnicalEffortChartRow[];
  height?: number;
}) {
  const gradientBase = biChartGradientId(useId(), "bi-tech");
  const maintenanceFill = gradientBase + "-maint";
  const followUpFill = gradientBase + "-follow";
  const chartRows = rows.slice(0, 8);
  if (!chartRows.length) return (
    <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
      {ui("Sem sessões com fase explícita no período")}
    </div>
  );
  const width = Math.min(145, Math.max(82, Math.max(...chartRows.map(r => r.label.length)) * 7));
  return (
    <div className="min-w-0 space-y-3" data-bi-technical-chart="true">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400"/>{ui("Manutenção")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400"/>{ui("Acompanhamento")}</span>
        <span className="ml-auto">{ui("Escala em horas técnicas")}</span>
      </div>
      <div style={{height}} className="w-full min-w-0" role="img"
        aria-label={ui("Comparativo empilhado de tempo de manutenção e acompanhamento por técnico ou área")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" barGap={1} margin={{top: 12,right: 92,bottom: 18,left: 0}}>
            <defs>
              <linearGradient id={maintenanceFill} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#0284c7" stopOpacity={0.8}/><stop offset="100%" stopColor="#38bdf8" stopOpacity={1}/></linearGradient>
              <linearGradient id={followUpFill} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#059669" stopOpacity={0.82}/><stop offset="100%" stopColor="#34d399" stopOpacity={1}/></linearGradient>
            </defs>
            <CartesianGrid horizontal={false} stroke={biChartGridColor} strokeOpacity={0.45} strokeDasharray="3 6"/>
            <XAxis type="number" domain={[0,"auto"]} axisLine={false} tickLine={false}
              tick={{fill:"var(--muted-foreground)",fontSize:11}}
              tickFormatter={v => (Number(v) / 60).toLocaleString(getInterfaceLocale(),{maximumFractionDigits:0}) + ui("h")}/>
            <YAxis type="category" dataKey="label" width={width} axisLine={false} tickLine={false}
              tick={{fill:"var(--muted-foreground)",fontSize:10}}
              tickFormatter={v => String(v).length > 18 ? String(v).slice(0,17) + "…" : String(v)}/>
            <Tooltip formatter={(v, name) => [duration(Number(v)), String(name)]}
              contentStyle={biChartTooltipStyle}/>
            <Bar dataKey="maintenanceMinutes" stackId="technical" name={ui("Manutenção")} fill={"url(#"+maintenanceFill+")"} maxBarSize={30} radius={[4,0,0,4]} background={{fill:"var(--muted)",fillOpacity:0.20}} animationDuration={420}>
              {chartRows.map(row => <Cell key={row.id} fill={"url(#"+maintenanceFill+")"}/>)}
            </Bar>
            <Bar dataKey="followUpMinutes" stackId="technical" name={ui("Acompanhamento")} fill={"url(#"+followUpFill+")"} maxBarSize={30} radius={[0,6,6,0]} animationDuration={420}>
              {chartRows.map(row => <Cell key={row.id} fill={"url(#"+followUpFill+")"}/>)}
              <LabelList dataKey="totalPersonMinutes" position="right" formatter={(v: unknown)=>duration(Number(v))} fill="var(--foreground)" fontSize={12}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">
        {ui("Horas técnicas são somadas por pessoa e podem ser simultâneas. Não representam horas de máquina parada.")}
        {rows.length > 8 && " " + ui("Exibindo as oito maiores participações. A tabela contém todos os registros.")}
      </p>
    </div>
  );
}
