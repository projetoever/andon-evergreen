import { getInterfaceLocale, ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "—";
  const total = Math.max(0, Math.round(value));
  const h = Math.floor(total / 60);
  return h > 0
    ? `${h}${ui("h")}${total % 60 ? ` ${total % 60}${ui("min")}` : ""}`
    : `${total}${ui("min")}`;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(getInterfaceLocale(), {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Values are contributions by operational calendar day inside the requested
 * rolling period. They are not cumulative, and the first/last dates may be
 * partial days. Bars avoid falsely suggesting an improving machine state.
 */
export function BiDowntimeTrendCard({
  data,
}: {
  data: Array<{ date: string; downtimeMinutes: number }>;
}) {
  useInterfaceLanguage();
  return (
    <article className="flex h-full min-h-0 flex-col rounded-xl border border-red-500/20 bg-gradient-to-br from-red-500/[0.05] to-card p-3 xl:p-4 shadow-sm">
      <h2 className="text-xs xl:text-sm font-black uppercase tracking-wide">
        {ui("Tempo de parada por dia")}
      </h2>
      <p
        className="mt-1 text-[10px] xl:text-[11px] leading-4 text-muted-foreground"
        title={ui(
          "São parcelas do downtime por data operacional; o primeiro e o último dia podem estar incompletos. Uma barra menor não indica melhora da máquina.",
        )}
      >
        {ui("Horas de parada em cada data · dias parciais no período móvel")}
      </p>

      {data.length ? (
        <div className="mt-2 h-60 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 1, right: 2 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateLabel}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) => `${Math.round(Number(value) / 60)}${ui("h")}`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                width={35}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(value) => formatDateLabel(String(value))}
                formatter={(value) => [formatMinutes(Number(value)), ui("Parada no dia")]}
                contentStyle={{
                  background: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 10,
                }}
              />
              <Bar
                name={ui("Parada no dia")}
                dataKey="downtimeMinutes"
                fill="#ef4444"
                fillOpacity={0.9}
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
          {ui("Sem parada física registrada no período")}
        </div>
      )}
    </article>
  );
}
