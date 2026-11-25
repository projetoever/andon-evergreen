import { useId } from "react";
import { ui } from "@/i18n/translate";
import { biChartGradientId, biChartGridColor, biChartPalette, biChartTooltipStyle } from "./biChartVisualTheme";
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { biParetoRows, type BiChartMode, type BiChartDatum } from "./biChartModePolicy";

type Props = {
  mode: Exclude<BiChartMode, "bars">; rows: BiChartDatum[];
  unit: "minutes" | "percent" | "count"; color: string;
  selectedId: string | null; onSelect: (id: string) => void;
  formatValue: (value: number | null) => string;
};

export function BiChartAlternative({mode, rows, unit, color, selectedId, onSelect, formatValue}:Props) {
  const gradientId = biChartGradientId(useId(), "bi-visual");
  const selectActive = (state: { activePayload?: Array<{payload?:BiChartDatum}> } | null) => {
    const id = state?.activePayload?.[0]?.payload?.id;
    if (id) onSelect(id);
  };
  const axis = <>
    <XAxis dataKey="label" tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false} minTickGap={10}/>
    <YAxis width={60} domain={unit==="percent" ? [0,100] : [0,"auto"]}
      tickFormatter={v=>formatValue(Number(v))} tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
  </>;
  const tooltip = <Tooltip formatter={v=>[formatValue(v == null ? null : Number(v)),ui("Valor observado")]} contentStyle={biChartTooltipStyle}/>;

  if (mode==="pie" || mode==="donut") {
    const slices=rows.filter(r=>r.value!==null && Number.isFinite(r.value) && r.value>0);
    return <ResponsiveContainer width="100%" height="100%">
      <PieChart><Pie data={slices} dataKey="value" nameKey="label" cx="50%" cy="50%"
        innerRadius={mode==="donut" ? "54%" : 0} outerRadius="78%" paddingAngle={3} cornerRadius={6} stroke="var(--card)" strokeWidth={3}
        onClick={r=>{const item=r as {id?:string;payload?:{id?:string}};const id=item.payload?.id ?? item.id;if(id)onSelect(String(id));}}>
        {slices.map((r,i)=><Cell key={r.id} fill={biChartPalette[i%biChartPalette.length]}
          fillOpacity={selectedId && selectedId!==r.id ? .35 : .96} cursor="pointer"/>)}
      </Pie>
      {mode==="donut" && <>
        <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="var(--foreground)" fontSize={23} fontWeight={800}>{formatValue(slices.reduce((n,r)=>n+(r.value??0),0))}</text>
        <text x="50%" y="59%" textAnchor="middle" dominantBaseline="middle" fill="var(--muted-foreground)" fontSize={11}>{slices.length} {ui("Categorias")}</text>
      </>}
      <Tooltip formatter={(v,name)=>[formatValue(v == null ? null : Number(v)),String(name)]} contentStyle={biChartTooltipStyle}/></PieChart>
    </ResponsiveContainer>;
  }
  if(mode==="pareto"){
    const ordered=biParetoRows(rows);
    return <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={ordered} onClick={selectActive} margin={{left:4,right:6,top:12,bottom:12}}>
        <defs><linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor={color} stopOpacity={0.58}/><stop offset="100%" stopColor={color} stopOpacity={1}/></linearGradient></defs>
        <CartesianGrid stroke={biChartGridColor} strokeOpacity={0.45} strokeDasharray="3 6" vertical={false}/>
        <XAxis dataKey="label" angle={-20} textAnchor="end" height={58}
          tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <YAxis yAxisId="amount" width={60} tickFormatter={v=>formatValue(Number(v))}
          tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <YAxis yAxisId="share" orientation="right" width={42} domain={[0,100]}
          tickFormatter={v=>`${v}%`} tick={{fill:"var(--muted-foreground)",fontSize:10}} axisLine={false} tickLine={false}/>
        <ReferenceLine yAxisId="share" y={80} stroke="#f59e0b" strokeDasharray="4 4"/>
        <Tooltip formatter={(v,name)=>[name===ui("Participação acumulada")
          ? `${Number(v).toFixed(1)}%` : formatValue(Number(v)), String(name)]} contentStyle={biChartTooltipStyle}/>
        <Bar yAxisId="amount" dataKey="value" name={ui("Valor observado")} fill={"url(#" + gradientId + ")"} maxBarSize={42} radius={[7,7,0,0]} background={{fill:"var(--muted)",fillOpacity:0.22}}>
          {ordered.map(r=><Cell key={r.id} fill={"url(#" + gradientId + ")"} fillOpacity={selectedId && selectedId!==r.id ? .35 : 1} cursor="pointer"/>)}
        </Bar>
        <Line yAxisId="share" dataKey="cumulativePercent" name={ui("Participação acumulada")}
          type="linear" stroke="#fbbf24" strokeWidth={3} dot={{r:3,fill:"var(--card)",strokeWidth:2}} activeDot={{r:6,fill:"#fbbf24",stroke:"var(--card)",strokeWidth:2}}/>
      </ComposedChart>
    </ResponsiveContainer>;
  }
  if(mode==="line")return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={rows} onClick={selectActive} margin={{left:2,right:12,top:12,bottom:4}}>
      <CartesianGrid stroke={biChartGridColor} strokeOpacity={0.45} strokeDasharray="3 6" vertical={false}/>
      {axis}{tooltip}<Line type="linear" dataKey="value" stroke={color}
        strokeWidth={3} connectNulls={false} dot={{r:3.5,fill:"var(--card)",strokeWidth:2}} activeDot={{r:6,fill:color,stroke:"var(--card)",strokeWidth:2}} animationDuration={420}/>
    </LineChart>
  </ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={rows} onClick={selectActive} margin={{left:2,right:12,top:12,bottom:4}}>
      <CartesianGrid stroke={biChartGridColor} strokeOpacity={0.45} strokeDasharray="3 6" vertical={false}/>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28}/><stop offset="100%" stopColor={color} stopOpacity={0.02}/></linearGradient></defs>
      {axis}{tooltip}<Area type="linear" dataKey="value" stroke={color} fill={"url(#" + gradientId + ")"}
        strokeWidth={3} connectNulls={false} dot={{r:3,fill:"var(--card)",strokeWidth:2}} activeDot={{r:6,fill:color,stroke:"var(--card)",strokeWidth:2}} animationDuration={420}/>
    </AreaChart>
  </ResponsiveContainer>;
}
