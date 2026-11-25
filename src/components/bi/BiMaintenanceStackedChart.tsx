import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  const chartRows = rows.slice(0, 8);
  if (!chartRows.length) return (
    <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
      {ui("Sem sessões com fase explícita no período")}
    </div>
  );
  const width = Math.min(145, Math.max(82, Math.max(...chartRows.map(r => r.label.length)) * 7));
  return (
    <div className="min-w-0 space-y-2" data-bi-technical-chart="true">
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-400"/>{ui("Manutenção")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400"/>{ui("Acompanhamento")}</span>
        <span className="ml-auto">{ui("Escala em horas por pessoa")}</span>
      </div>
      <div style={{height}} className="w-full min-w-0" role="img"
        aria-label={ui("Comparativo empilhado de tempo de manutenção e acompanhamento por técnico ou área")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} layout="vertical" barGap={1} margin={{top: 8,right: 24,bottom: 15,left: 0}}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3"/>
            <XAxis type="number" domain={[0,"auto"]} axisLine={false} tickLine={false}
              tick={{fill:"var(--muted-foreground)",fontSize:10}}
              tickFormatter={v => (Number(v) / 60).toLocaleString(getInterfaceLocale(),{maximumFractionDigits:0}) + ui("h")}/>
            <YAxis type="category" dataKey="label" width={width} axisLine={false} tickLine={false}
              tick={{fill:"var(--muted-foreground)",fontSize:10}}
              tickFormatter={v => String(v).length > 18 ? String(v).slice(0,17) + "…" : String(v)}/>
            <Tooltip formatter={(v, name) => [duration(Number(v)), String(name)]}
              contentStyle={{background:"var(--popover)",borderColor:"var(--border)",borderRadius:10}}/>
            <Bar dataKey="maintenanceMinutes" stackId="technical" name={ui("Manutenção")} fill="#38bdf8" maxBarSize={25} radius={[0,0,0,0]}>
              {chartRows.map(row => <Cell key={row.id} fill="#38bdf8"/>)}
            </Bar>
            <Bar dataKey="followUpMinutes" stackId="technical" name={ui("Acompanhamento")} fill="#10b981" maxBarSize={25} radius={[0,4,4,0]}>
              {chartRows.map(row => <Cell key={row.id} fill="#10b981"/>)}
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
