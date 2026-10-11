import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function formatMinutes(value: number) {
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function BiDowntimeTrendCard({
  data,
}: {
  data: Array<{ date: string; downtimeMinutes: number }>;
}) {
  return (
    <article className="min-h-80 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-black uppercase tracking-wide">Evolução do downtime</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Parada física por dia operacional, sem dupla contagem por máquina
      </p>

      {data.length ? (
        <div className="mt-5 h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(value) => formatDateLabel(String(value))}
                formatter={(value) => [formatMinutes(Number(value)), "Downtime"]}
                contentStyle={{
                  background: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 10,
                }}
              />
              <Area
                name="Downtime"
                type="monotone"
                dataKey="downtimeMinutes"
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.16}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 flex h-60 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          Sem downtime no período
        </div>
      )}
    </article>
  );
}
