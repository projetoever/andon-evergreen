import { useId } from "react";
import { getInterfaceLocale, ui } from "@/i18n/translate";
import { biChartGradientId, biChartGridColor, biChartTooltipStyle } from "@/components/bi/biChartVisualTheme";
import { BiChartExplorer } from "@/components/bi/BiChartExplorer";
import { BiProductionCoverageDialog } from "@/components/bi/BiProductionCoverageDialog";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsProductionMetrics } from "@/types/analytics";

function dayLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(getInterfaceLocale(), {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}
function minutes(value: number) {
  const n = Math.round(value);
  if (n <= 0) return `0${ui("min")}`;
  const h = Math.floor(n / 60);
  return h ? `${h}${ui("h")}${n % 60 ? ` ${n % 60}${ui("min")}` : ""}` : `${n}${ui("min")}`;
}
export function BiDailyAvailabilityCard({
  data,
}: {
  data: AnalyticsProductionMetrics | null | undefined;
}) {
  useInterfaceLanguage();
  const availabilityFill = biChartGradientId(useId(), "bi-availability");
  const available =
    data?.availabilityStatus === "available" && data.daily.some((d) => d.scheduledMinutes > 0);
  return (
    <article className="flex min-h-0 flex-col rounded-xl border border-emerald-500/20 bg-card p-3 xl:p-4 shadow-sm">
      <h2 className="text-xs font-black uppercase tracking-wide">
        {ui("Disponibilidade por dia")}
      </h2>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {ui("Tempo programado sem paradas registradas · percentual")}
      </p>
      {available ? (
        <div className="mt-2 h-60 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <BiChartExplorer
            title={ui("Disponibilidade por dia")}
            description={ui("Tempo programado sem paradas registradas · percentual")}
            unit="percent"
            chartKind="temporal"
            defaultMode="line"
            color="#10b981"
            caution={ui("Dias sem programação não são zero por cento. Compare somente dias com histórico verificável; a média simples não substitui o KPI consolidado.")}
            rows={data!.daily.map((day) => ({
              id: day.date,
              label: dayLabel(day.date),
              value: day.scheduledMinutes > 0 ? day.availabilityPercent : null,
              details: [
                { label: ui("Programado"), value: minutes(day.scheduledMinutes) },
                { label: ui("Parada na programação"), value: minutes(day.scheduledDowntimeMinutes) },
              ],
            }))}
            className="h-full"
          >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data!.daily} margin={{ left: 0, right: 3, top: 10, bottom: 2 }}>
              <defs><linearGradient id={availabilityFill} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#059669" stopOpacity={0.55}/><stop offset="100%" stopColor="#34d399" stopOpacity={1}/></linearGradient></defs>
              <CartesianGrid stroke={biChartGridColor} strokeOpacity={0.45} strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={dayLabel}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={12}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                width={34}
                tickFormatter={(x) => `${x}%`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                labelFormatter={(x) => dayLabel(String(x))}
                formatter={(value, name, item) => {
                  const p = item?.payload as
                    | {
                        scheduledMinutes: number;
                        scheduledDowntimeMinutes: number;
                        availabilityPercent: number | null;
                      }
                    | undefined;
                  return [
                    p?.availabilityPercent === null
                      ? ui("Sem produção programada")
                      : ui("{0}% · {1} programados · {2} parados", {
                          0: Number(value).toLocaleString(getInterfaceLocale(), {
                            maximumFractionDigits: 2,
                          }),
                          1: minutes(p?.scheduledMinutes ?? 0),
                          2: minutes(p?.scheduledDowntimeMinutes ?? 0),
                        }),
                    ui("Disponibilidade"),
                  ];
                }}
                contentStyle={biChartTooltipStyle}
              />
              <Bar
                name={ui("Disponibilidade")}
                dataKey="availabilityPercent"
                fill={"url(#" + availabilityFill + ")"}
                radius={[7, 7, 0, 0]}
                maxBarSize={35}
                background={{fill:"var(--muted)",fillOpacity:0.20}}
                animationDuration={420}
              />
            </BarChart>
          </ResponsiveContainer>
          </BiChartExplorer>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 items-center justify-center text-center text-xs text-muted-foreground">
          {data?.availabilityStatus === "dimension_filtered"
            ? ui("Indisponível com filtro de setor ou classificação.")
            : ui("Não há tempo programado com histórico completo na seleção.")}
        </div>
      )}
      <p className="mt-1 shrink-0 text-[10px] text-muted-foreground">
        {data
          ? ui("{0}/{1} máquina(s) com histórico completo · dias parciais possíveis", {
              0: data.coveredMachineCount,
              1: data.populationCount,
            })
          : ui("Aguardando histórico de programação")}
        {data?.machineCoverage && <BiProductionCoverageDialog data={data} />}
      </p>
    </article>
  );
}
