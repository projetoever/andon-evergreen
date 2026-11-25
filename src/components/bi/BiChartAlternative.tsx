import { ui } from "@/i18n/translate";
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { biParetoRows, type BiChartMode, type BiChartDatum } from "./biChartModePolicy";

type Props = {
  mode: Exclude<BiChartMode, "bars">; rows: BiChartDatum[];
  unit: "minutes" | "percent" | "count"; color: string;
  selectedId: string | null; onSelect: (id: string) => void;
  formatValue: (value: number | null) => string;
};
const tones = ["#38bdf8", "#f59e0b", "#10b981", "#ef4444", "#a78bfa", "#fb7185", "#14b8a6"];
const popup = { background: "var(--popover)", borderColor: "var(--border)", borderRadius: 10 };

export function BiChartAlternative({mode, rows, unit, color, selectedId, onSelect, formatValue}:Props) {
  const selectActive = (state: { activePayload?: Array<{payload?:BiChartDatum}> } | null) => {
    const id = state?.activePayload?.[0]?.payload?.id;
    if (id) onSelect(id);
  };
  const axis = <>
    <XAxis dataKey="label" tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false} minTickGap={10}/>
    <YAxis width={60} domain={unit==="percent" ? [0,100] : [0,"auto"]}
      tickFormatter={v=>formatValue(Number(v))} tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
  </>;
  const tooltip = <Tooltip formatter={v=>[formatValue(Number(v)),ui("Valor observado")]} contentStyle={popup}/>;

  if (mode==="pie" || mode==="donut") {
    const slices=rows.filter(r=>r.value!==null && Number.isFinite(r.value) && r.value>0);
    return <ResponsiveContainer width="100%" height="100%">
      <PieChart><Pie data={slices} dataKey="value" nameKey="label" cx="50%" cy="50%"
        innerRadius={mode==="donut" ? "46%" : 0} outerRadius="75%" stroke="var(--background)" strokeWidth={2}
        onClick={r=>{const item=r as {id?:string;payload?:{id?:string}};const id=item.payload?.id ?? item.id;if(id)onSelect(String(id));}}>
        {slices.map((r,i)=><Cell key={r.id} fill={tones[i%tones.length]}
          fillOpacity={selectedId && selectedId!==r.id ? .35 : .96} cursor="pointer"/>)}
      </Pie><Tooltip formatter={(v,name)=>[formatValue(Number(v)),String(name)]} contentStyle={popup}/></PieChart>
    </ResponsiveContainer>;
  }
  if(mode==="pareto"){
    const ordered=biParetoRows(rows);
    return <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={ordered} onClick={selectActive} margin={{left:4,right:6,top:12,bottom:12}}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
        <XAxis dataKey="label" angle={-20} textAnchor="end" height={58}
          tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <YAxis yAxisId="amount" width={60} tickFormatter={v=>formatValue(Number(v))}
          tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <YAxis yAxisId="share" orientation="right" width={42} domain={[0,100]}
          tickFormatter={v=>`${v}%`} tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <ReferenceLine yAxisId="share" y={80} stroke="#f59e0b" strokeDasharray="4 4"/>
        <Tooltip formatter={(v,name)=>[name===ui("Participação acumulada")
          ? `${Number(v).toFixed(1)}%` : formatValue(Number(v)), String(name)]} contentStyle={popup}/>
        <Bar yAxisId="amount" dataKey="value" name={ui("Valor observado")} fill={color} maxBarSize={40} radius={[4,4,0,0]}>
          {ordered.map(r=><Cell key={r.id} fill={color} fillOpacity={selectedId && selectedId!==r.id ? .35 : .9} cursor="pointer"/>)}
        </Bar>
        <Line yAxisId="share" dataKey="cumulativePercent" name={ui("Participação acumulada")}
          type="linear" stroke="#f59e0b" strokeWidth={2.5} dot={{r:3}} activeDot={{r:6}}/>
      </ComposedChart>
    </ResponsiveContainer>;
  }
  if(mode==="line")return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={rows} onClick={selectActive} margin={{left:2,right:12,top:12,bottom:4}}>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
      {axis}{tooltip}<Line type="linear" dataKey="value" stroke={color}
        strokeWidth={2.5} connectNulls={false} dot={{r:4}} activeDot={{r:7}}/>
    </LineChart>
  </ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={rows} onClick={selectActive} margin={{left:2,right:12,top:12,bottom:4}}>
      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
      {axis}{tooltip}<Area type="linear" dataKey="value" stroke={color} fill={color}
        fillOpacity={.15} strokeWidth={2.5} connectNulls={false} dot={{r:3}} activeDot={{r:6}}/>
    </AreaChart>
  </ResponsiveContainer>;
}
