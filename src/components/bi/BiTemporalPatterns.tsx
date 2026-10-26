import { ui, systemMessage } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CalendarDays, Clock3, TimerReset } from "lucide-react";
import type { AnalyticsTemporalPatterns } from "@/types/analytics";

type Metric = "calls" | "downtime";
type Cell = AnalyticsTemporalPatterns["heatmap"][number];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const metricValue = (cell: Cell, metric: Metric) =>
  metric === "calls" ? cell.callsOpened : cell.downtimeMinutes;
const minutes = (total: number) => {
  if (!Number.isFinite(total)) return "—";
  const n = Math.max(0, Math.round(total));
  return n >= 60
    ? `${Math.floor(n / 60)}${ui("h")}${n % 60 ? ` ${n % 60}${ui("min")}` : ""}`
    : `${n}${ui("min")}`;
};

function SmallCard({
  label,
  value,
  note,
  type,
}: {
  label: string;
  value: string;
  note: string;
  type: "red" | "amber" | "blue" | "green";
}) {
  useInterfaceLanguage();
  const border = {
    red: "border-red-500/25 bg-red-500/[0.045]",
    amber: "border-amber-500/25 bg-amber-500/[0.045]",
    blue: "border-sky-500/25 bg-sky-500/[0.045]",
    green: "border-emerald-500/25 bg-emerald-500/[0.045]",
  }[type];
  return (
    <div className={`min-w-0 rounded-lg border p-3 ${border}`}>
      <p className="truncate text-[11px] font-black uppercase text-muted-foreground" title={label}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}

export function BiTemporalPatterns({
  data,
  loading,
  error,
}: {
  data: AnalyticsTemporalPatterns | null;
  loading: boolean;
  error: string | null;
}) {
  useInterfaceLanguage();
  const [metric, setMetric] = useState<Metric>("calls");
  const [selected, setSelected] = useState<{ weekday: number; hour: number } | null>(null);
  useEffect(() => {
    setSelected(null);
  }, [metric, data]);
  const rows = useMemo(
    () => DAYS.map((_, day) => data?.heatmap.filter((c) => c.weekday === day) ?? []),
    [data],
  );

  if (loading && !data)
    return <div className="h-full animate-pulse rounded-xl border border-border bg-card" />;
  if (error)
    return (
      <div
        role="alert"
        className="h-full rounded-xl border border-red-500/30 bg-card p-4 text-sm text-red-300"
      >
        {ui("Análise temporal indisponível: ")}
        {systemMessage(error)}
      </div>
    );
  if (!data)
    return (
      <div className="h-full rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        {ui("Aguardando período e filtros.")}
      </div>
    );

  const t = data.totals;
  const metricName = metric === "calls" ? ui("chamados abertos") : ui("parada física");
  const unit = metric === "calls" ? ui("chamados") : ui("min");
  const max = Math.max(0, ...data.heatmap.map((x) => metricValue(x, metric)));
  const byHour = data.byHour.map((x) => ({
    hourLabel: String(x.hour).padStart(2, "0"),
    count: metric === "calls" ? x.callsOpened : x.downtimeMinutes,
  }));
  const byWeekday = data.byWeekday.map((x) => ({
    day: ui(DAYS[x.weekday] ?? x.day),
    count: metric === "calls" ? x.callsOpened : x.downtimeMinutes,
  }));
  const formatter = (n: number) =>
    metric === "calls" ? ui("{0} chamado(s)", { 0: n }) : minutes(n);
  const peakHours = [...byHour]
    .sort((a, b) => b.count - a.count || a.hourLabel.localeCompare(b.hourLabel))
    .filter((x) => x.count > 0)
    .slice(0, 3);
  const selection = selected
    ? data.heatmap.find((c) => c.weekday === selected.weekday && c.hour === selected.hour)
    : null;

  return (
    <div className="grid min-w-0 lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] gap-2">
      <div className="grid shrink-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <SmallCard
          label={ui("Novos chamados")}
          value={String(t.callsOpened)}
          note={ui("Aberturas na janela selecionada")}
          type="amber"
        />
        <SmallCard
          label={ui("Tempo de parada")}
          value={minutes(t.physicalDowntimeMinutes)}
          note={ui("Intervalos físicos unidos por máquina")}
          type="red"
        />
        <SmallCard
          label={ui("Pico de aberturas")}
          value={
            t.peakCallHours.length === 0
              ? "—"
              : t.peakCallHours.length > 1
                ? ui("Empate")
                : `${String(t.peakCallHour).padStart(2, "0")}${ui("h")}`
          }
          note={
            t.peakCallHours.length === 0
              ? ui("Sem aberturas no período")
              : t.peakCallHours.length > 1
                ? ui("{0} horários empatados no volume máximo", { 0: t.peakCallHours.length })
                : ui("Horário local com maior volume")
          }
          type="blue"
        />
        <SmallCard
          label={ui("Pico de parada")}
          value={
            t.peakPhysicalHours.length === 0
              ? "—"
              : t.peakPhysicalHours.length > 1
                ? ui("Empate")
                : `${String(t.peakPhysicalHour).padStart(2, "0")}${ui("h")}`
          }
          note={
            t.peakPhysicalHours.length === 0
              ? ui("Sem parada no período")
              : t.peakPhysicalHours.length > 1
                ? ui("{0} horários empatados; parada prolongada é possível", {
                    0: t.peakPhysicalHours.length,
                  })
                : ui("Faixa local com mais minutos acumulados")
          }
          type="red"
        />
      </div>

      <div className="grid min-h-0 gap-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.65fr)]">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
                <CalendarDays className="h-4 w-4 text-sky-300" />
                {ui(" Mapa de calor por dia e hora")}
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ui("Horário local · totais dentro da janela filtrada")}
              </p>
            </div>
            <div
              className="flex shrink-0 rounded-lg border border-border bg-background/50 p-1"
              role="group"
              aria-label={ui("Métrica do mapa de calor")}
            >
              <button
                type="button"
                aria-pressed={metric === "calls"}
                onClick={() => setMetric("calls")}
                className={`rounded px-3 py-1.5 text-xs font-bold ${metric === "calls" ? "bg-amber-500/15 text-amber-200" : "text-muted-foreground hover:bg-muted"}`}
              >
                {ui("Chamados")}
              </button>
              <button
                type="button"
                aria-pressed={metric === "downtime"}
                onClick={() => setMetric("downtime")}
                className={`rounded px-3 py-1.5 text-xs font-bold ${metric === "downtime" ? "bg-red-500/15 text-red-200" : "text-muted-foreground hover:bg-muted"}`}
              >
                {ui("Tempo de parada")}
              </button>
            </div>
          </header>

          <div className="min-w-0 overflow-x-auto lg:contents">
          <div className="mt-3 grid shrink-0 min-w-[74rem] lg:min-w-0 grid-cols-[42px_minmax(0,1fr)] items-end gap-1">
            <span />
            <div
              className="grid grid-cols-24 gap-0.5 text-center text-[10px] text-muted-foreground"
              style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}
            >
              {Array.from({ length: 24 }, (_, i) => (
                <span key={i}>{i % 3 === 0 ? String(i).padStart(2, "0") : ""}</span>
              ))}
            </div>
          </div>

          <div className="mt-1 grid min-h-[22rem] min-w-[74rem] lg:min-w-0 lg:min-h-0 lg:flex-1 grid-rows-7 gap-1">
            {rows.map((dayCells, weekday) => (
              <div
                key={weekday}
                className="grid min-h-0 grid-cols-[42px_minmax(0,1fr)] items-stretch gap-1"
              >
                <div className="flex items-center text-xs font-bold text-muted-foreground">
                  {ui(DAYS[weekday])}
                </div>
                <div
                  className="grid min-h-0 gap-1"
                  style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}
                >
                  {dayCells.map((cell) => {
                    const n = metricValue(cell, metric);
                    const ratio = max > 0 ? n / max : 0;
                    const color =
                      metric === "calls"
                        ? `rgba(245,158,11,${n > 0 ? 0.23 + 0.72 * ratio : 0.045})`
                        : `rgba(239,68,68,${n > 0 ? 0.23 + 0.72 * ratio : 0.045})`;
                    const chosen =
                      selected?.weekday === cell.weekday && selected.hour === cell.hour;
                    const tip = `${ui(DAYS[cell.weekday] ?? cell.day)} ${String(cell.hour).padStart(2, "0")}:00 — ${metric === "calls" ? `${ui("{0} abertura(s)", { 0: cell.callsOpened })}` : minutes(cell.downtimeMinutes)}`;
                    return (
                      <button
                        type="button"
                        key={cell.hour}
                        title={tip}
                        aria-label={tip}
                        onClick={() => setSelected({ weekday: cell.weekday, hour: cell.hour })}
                        className={`min-w-0 rounded-sm border transition hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-sky-300 ${chosen ? "border-white" : "border-white/5"}`}
                        style={{ backgroundColor: color }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
          <div className="mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {selection
                ? ui("{0} {1}h · {2}", {
                    0: ui(DAYS[selection.weekday] ?? selection.day),
                    1: String(selection.hour).padStart(2, "0"),
                    2: formatter(metricValue(selection, metric)),
                  })
                : max === 0
                  ? ui("Sem {0} nesta janela; selecione outra data", { 0: metricName })
                  : ui("Selecione uma célula para consultar o valor")}
            </span>
            <span className="shrink-0">
              {ui("Menor ")}
              <span className="mx-1 opacity-50">■</span>
              <span className={metric === "calls" ? "text-amber-400" : "text-red-400"}>■</span>
              {ui(" Maior")}
            </span>
          </div>
        </section>

        <aside className="grid min-w-0 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_minmax(0,0.85fr)_auto] gap-2">
          <article className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3">
            <h3 className="flex shrink-0 items-center gap-2 text-xs font-black uppercase">
              <Clock3 className="h-4 w-4 text-amber-300" />
              {ui(" Distribuição por horário")}
            </h3>
            <div className="mt-2 h-56 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byHour} margin={{ left: 0, right: 1, top: 1, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    interval={2}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={35}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(n) => (metric === "calls" ? String(n) : minutes(n))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [formatter(Number(v)), metricName]}
                    labelFormatter={(v) => `${v}${ui("h")}`}
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={metric === "calls" ? "#f59e0b" : "#ef4444"}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <article className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-3">
            <h3 className="flex shrink-0 items-center gap-2 text-xs font-black uppercase">
              <Activity className="h-4 w-4 text-sky-300" />
              {ui(" Distribuição por dia da semana")}
            </h3>
            <div className="mt-2 h-56 min-w-0 lg:h-auto lg:min-h-0 lg:flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byWeekday} margin={{ left: 0, right: 1, top: 1, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    width={35}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    tickFormatter={(n) => (metric === "calls" ? String(n) : minutes(n))}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v) => [formatter(Number(v)), metricName]}
                    contentStyle={{
                      background: "var(--popover)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill={metric === "calls" ? "#f59e0b" : "#ef4444"}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2 text-[11px] leading-4 text-muted-foreground">
            <TimerReset className="mr-1 inline h-3.5 w-3.5 text-amber-300" />
            {ui(
              "Horários de abertura e de parada são diferentes. Paradas abertas continuam contando; dias parciais e ausência de turnos históricos impedem concluir qual horário é mais arriscado.",
            )}
            {peakHours.length
              ? ui(" Picos no período: {0}.", {
                  0: peakHours.map((x) => `${x.hourLabel}${ui("h")}`).join(", "),
                })
              : ""}
          </div>
        </aside>
      </div>
    </div>
  );
}
