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
    <article className="flex h-full min-h-0 flex-col rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.05] to-card p-4 shadow-sm">
      <h2 className="text-xs font-black uppercase tracking-wide">Evolução do downtime</h2>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Parada física acumulada por dia operacional, sem dupla contagem por máquina
      </p>

      {data.length ? (
        <div className="mt-2 min-h-0 flex-1">
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
                formatter={(value) => [formatMinutes(Number(value)), "Downtime acumulado"]}
                contentStyle={{
                  background: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 10,
                }}
              />
              <Area
                name="Downtime acumulado"
                type="monotone"
                dataKey="downtimeMinutes"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.16}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          Sem downtime no período
        </div>
      )}
    </article>
  );
}
