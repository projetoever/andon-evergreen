import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsOverview } from "@/types/analytics";

const label = (value: string) => {
  const [year, month, day] = value.split("-");
  return `${day}/${month}`;
};
const minutes = (value: number) => {
  const rounded = Math.round(value);
  return rounded >= 60 ? `${Math.floor(rounded / 60)}h${rounded%60 ? ` ${rounded%60}min` : ""}` : `${rounded}min`;
};

export function BiAvailabilityDailyCard({overview}: {overview: AnalyticsOverview | null}) {
  const data = overview?.scheduledPerformance;
  const rows = data?.daily ?? [];
  const ready = Boolean(data?.coverageComplete && data.scheduledMinutes && data.scheduledMinutes > 0);
  return (
    <article className="flex h-full min-h-0 flex-col rounded-xl border border-emerald-500/20 bg-card p-3 xl:p-4 shadow-sm">
      <h2 className="text-xs xl:text-sm font-black uppercase tracking-wide">Disponibilidade por dia</h2>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Percentual sobre tempo registrado como produção programada
      </p>
      {ready && rows.some(r=>r.availabilityPercent !== null) ? (
        <div className="mt-2 min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{left:0,right:2,top:4,bottom:0}}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="date" tickFormatter={label}
                tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} width={38}
                tickFormatter={v=>`${v}%`} tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{background:"var(--popover)",borderColor:"var(--border)",borderRadius:9}}
                labelFormatter={v=>label(String(v))}
                formatter={(value,name,context)=>{
                  const row = context?.payload as (typeof rows)[number] | undefined;
                  return [`${value === null || value === undefined ? "—" : Number(value).toLocaleString("pt-BR",{maximumFractionDigits:2})+"%"} · ${row ? minutes(row.scheduledMinutes) : "—"} programados · ${row ? minutes(row.stoppedMinutes) : "—"} de parada`, "Disponibilidade"];
                }}/>
              <Bar name="Disponibilidade" dataKey="availabilityPercent" fill="#10b981"
                radius={[4,4,0,0]} maxBarSize={32}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs leading-5 text-amber-300">
          {data?.reason ?? "Sem histórico completo de produção programada para este período."}
        </div>
      )}
    </article>
  );
}
