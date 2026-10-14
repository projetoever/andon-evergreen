import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AnalyticsProductionMetrics } from "@/types/analytics";

function dayLabel(value: string) {
  const date=new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(date);
}
function minutes(value:number){
  const n=Math.round(value);
  if(n<=0)return "0min";
  const h=Math.floor(n/60);
  return h?`${h}h${n%60?` ${n%60}min`:""}`:`${n}min`;
}
export function BiDailyAvailabilityCard({data}: {data:AnalyticsProductionMetrics|null|undefined}){
  const available=data?.availabilityStatus==="available" && data.daily.some(d=>d.scheduledMinutes>0);
  return (
    <article className="flex min-h-0 flex-col rounded-xl border border-emerald-500/20 bg-card p-3 xl:p-4 shadow-sm">
      <h2 className="text-xs font-black uppercase tracking-wide">Disponibilidade por dia</h2>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        Tempo programado sem paradas registradas · percentual
      </p>
      {available ? (
        <div className="mt-2 min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data!.daily} margin={{left:0,right:2,top:0,bottom:0}}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
              <XAxis dataKey="date" tickFormatter={dayLabel}
                tick={{fill:"var(--muted-foreground)",fontSize:11}} axisLine={false} tickLine={false} minTickGap={12}/>
              <YAxis domain={[0,100]} ticks={[0,25,50,75,100]} width={34}
                tickFormatter={x=>`${x}%`} tick={{fill:"var(--muted-foreground)",fontSize:10}}
                axisLine={false} tickLine={false}/>
              <Tooltip labelFormatter={x=>dayLabel(String(x))}
                formatter={(value,name,item)=>{
                  const p=item?.payload as {scheduledMinutes:number;scheduledDowntimeMinutes:number;availabilityPercent:number|null}|undefined;
                  return [p?.availabilityPercent===null?"Sem produção programada":
                    `${Number(value).toLocaleString("pt-BR",{maximumFractionDigits:2})}% · ${minutes(p?.scheduledMinutes??0)} programados · ${minutes(p?.scheduledDowntimeMinutes??0)} parados`,"Disponibilidade"];
                }}
                contentStyle={{background:"var(--popover)",borderColor:"var(--border)",borderRadius:10}}/>
              <Bar name="Disponibilidade" dataKey="availabilityPercent"
                fill="#10b981" radius={[4,4,0,0]} maxBarSize={35}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ):(
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center text-center text-xs text-muted-foreground">
          {data?.availabilityStatus==="dimension_filtered"
            ?"Indisponível com filtro de setor ou classificação."
            :"Não há tempo programado com histórico completo na seleção."}
        </div>
      )}
      <p className="mt-1 shrink-0 text-[10px] text-muted-foreground">
        {data? `${data.coveredMachineCount}/${data.populationCount} máquina(s) com histórico completo · dias parciais possíveis` :
          "Aguardando histórico de programação"}
      </p>
    </article>
  );
}
