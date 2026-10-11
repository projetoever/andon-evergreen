import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  RefreshCw,
  RotateCcw,
  TimerReset,
  Wrench,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { loadAndonBiFilterOptions, loadExecutiveOverview } from "@/services/andonBiService";
import type {
  AnalyticsOverview,
  AndonBiFilterOptions,
  AndonBiFilters,
  AndonBiPeriodPreset,
} from "@/types/analytics";

const EMPTY_OPTIONS: AndonBiFilterOptions = {
  machines: [],
  sectors: [],
  classifications: [],
};

const DEFAULT_FILTERS: AndonBiFilters = {
  period: "7d",
  machineId: "",
  subtype: "",
  classification: "",
};

const PERIOD_LABELS: Record<AndonBiPeriodPreset, string> = {
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

function formatMinutes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  if (value < 60) {
    return `${Math.round(value)} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 text-3xl font-black tabular-nums">{value}</div>
      <p className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">{detail}</p>
    </article>
  );
}

export function AndonBiPage() {
  const [filters, setFilters] = useState<AndonBiFilters>(DEFAULT_FILTERS);
  const [options, setOptions] = useState<AndonBiFilterOptions>(EMPTY_OPTIONS);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setOptionsLoading(true);

    void loadAndonBiFilterOptions()
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Falha ao carregar filtros.");
        }
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadOverview = useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadExecutiveOverview(filters)
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Falha ao carregar indicadores do ANDON BI.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters]);

  useEffect(() => loadOverview(), [loadOverview, refreshVersion]);

  const classificationLabels = useMemo(
    () => new Map(options.classifications.map((item) => [item.value, item.label])),
    [options.classifications],
  );
  const sectorLabels = useMemo(
    () => new Map(options.sectors.map((item) => [item.id, item.displayName])),
    [options.sectors],
  );

  const classificationData = useMemo(
    () =>
      (overview?.classificationPareto ?? []).slice(0, 8).map((item) => ({
        ...item,
        label: classificationLabels.get(item.label) ?? item.label,
      })),
    [classificationLabels, overview],
  );

  const sectorData = useMemo(
    () =>
      (overview?.sectorDistribution ?? []).slice(0, 8).map((item) => ({
        ...item,
        label: sectorLabels.get(item.label) ?? item.label,
      })),
    [overview, sectorLabels],
  );

  const kpis = overview?.kpis;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Maintenance & Reliability Intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">ANDON BI</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Visão executiva baseada exclusivamente nos registros operacionais do ANDON.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overview && (
              <span className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                Atualizado{" "}
                {new Intl.DateTimeFormat("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: overview.meta.timeZone,
                }).format(new Date(overview.meta.generatedAt))}
              </span>
            )}
            <button
              type="button"
              onClick={() => setRefreshVersion((value) => value + 1)}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <Link
              to="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted"
            >
              ANDON operacional
            </Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Período
            <select
              value={filters.period}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  period: event.target.value as AndonBiPeriodPreset,
                }))
              }
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Máquina
            <select
              value={filters.machineId}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({ ...current, machineId: event.target.value }))
              }
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todas as máquinas</option>
              {options.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}{machine.isActive === false ? " · inativa" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Setor
            <select
              value={filters.subtype}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({ ...current, subtype: event.target.value }))
              }
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todos os setores</option>
              {options.sectors.map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.displayName}{sector.active === false ? " · inativo" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Classificação
            <select
              value={filters.classification}
              disabled={optionsLoading}
              onChange={(event) =>
                setFilters((current) => ({ ...current, classification: event.target.value }))
              }
              className="h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold normal-case text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">Todas as classificações</option>
              {options.classifications.map((classification) => (
                <option key={classification.id} value={classification.value}>
                  {classification.label}{classification.active === false ? " · inativa" : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && (
          <div className="rounded-xl border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Chamados"
            value={loading && !overview ? "…" : String(kpis?.callsOpened ?? 0)}
            detail={`${kpis?.callsFinished ?? 0} concluídos no período`}
            icon={Activity}
          />
          <KpiCard
            label="Ativos agora"
            value={
              loading && !overview
                ? "…"
                : kpis?.activeCallsNow === null
                  ? "—"
                  : String(kpis?.activeCallsNow ?? 0)
            }
            detail={
              kpis?.activeCallsNow === null
                ? "Indisponível com filtro de classificação"
                : "Snapshot atual do ANDON"
            }
            icon={BarChart3}
          />
          <KpiCard
            label="MTTA"
            value={loading && !overview ? "…" : formatMinutes(kpis?.mttaMinutes ?? null)}
            detail={`Amostra: ${overview?.coverage.mttaSampleSize ?? 0} atendimentos`}
            icon={Clock3}
          />
          <KpiCard
            label="Manutenção"
            value={
              loading && !overview
                ? "…"
                : formatMinutes(kpis?.avgMaintenanceMinutes ?? null)
            }
            detail={`Média · ${overview?.coverage.maintenanceTimeSampleSize ?? 0} chamados`}
            icon={Wrench}
          />
          <KpiCard
            label="Downtime físico"
            value={loading && !overview ? "…" : formatMinutes(kpis?.downtimeMinutes ?? 0)}
            detail={`${kpis?.failureOccurrences ?? 0} ocorrências físicas iniciadas`}
            icon={TimerReset}
          />
          <KpiCard
            label="Retorno"
            value={
              loading && !overview
                ? "…"
                : kpis?.maintenanceReturnRatePercent === null
                  ? "—"
                  : `${kpis?.maintenanceReturnRatePercent ?? 0}%`
            }
            detail={`${kpis?.returnedCalls ?? 0} chamados · ${kpis?.maintenanceReturnCycles ?? 0} ciclos`}
            icon={RotateCcw}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-5">
          <article className="min-h-80 rounded-xl border border-border bg-card p-5 shadow-sm xl:col-span-3">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide">
                  Tendência de chamados
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aberturas e conclusões por dia operacional
                </p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                {PERIOD_LABELS[filters.period]}
              </span>
            </div>

            {overview?.trend.length ? (
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overview.trend}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={(value) => formatDateLabel(String(value))}
                      contentStyle={{
                        background: "var(--popover)",
                        borderColor: "var(--border)",
                        borderRadius: 10,
                      }}
                    />
                    <Line
                      name="Abertos"
                      type="monotone"
                      dataKey="callsOpened"
                      stroke="var(--chart-2)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      name="Concluídos"
                      type="monotone"
                      dataKey="callsFinished"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Nenhum chamado no período selecionado
              </div>
            )}
          </article>

          <article className="min-h-80 rounded-xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
            <h2 className="text-sm font-black uppercase tracking-wide">
              Pareto de máquinas
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Downtime físico sem dupla contagem
            </p>

            {overview?.machinePareto.length ? (
              <div className="mt-5 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={overview.machinePareto.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 12 }}
                  >
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="machineName"
                      width={92}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [formatMinutes(Number(value)), "Downtime"]}
                      contentStyle={{
                        background: "var(--popover)",
                        borderColor: "var(--border)",
                        borderRadius: 10,
                      }}
                    />
                    <Bar dataKey="downtimeMinutes" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mt-5 flex h-60 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Sem downtime no período
              </div>
            )}
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide">
              Pareto de classificações
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Diagnóstico registrado na conclusão dos chamados
            </p>
            <div className="mt-5 space-y-3">
              {classificationData.length ? (
                classificationData.map((item, index) => {
                  const max = classificationData[0]?.count || 1;
                  return (
                    <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-semibold">
                            {index + 1}. {item.label}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="self-end text-sm font-black tabular-nums">{item.count}</span>
                    </div>
                  );
                })
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Sem classificações concluídas no período
                </div>
              )}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide">Demanda por setor</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Chamados abertos no período selecionado
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {sectorData.length ? (
                sectorData.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-4 py-3"
                  >
                    <span className="truncate text-sm font-semibold">{item.label}</span>
                    <span className="ml-3 text-lg font-black tabular-nums">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  Sem chamados no período
                </div>
              )}
            </div>
          </article>
        </section>

        {overview && (
          <footer className="flex flex-col gap-2 border-t border-border pt-4 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>
              Fórmula {overview.meta.metricDefinitionVersion} · testes de sistema excluídos ·
              PostgreSQL como fonte oficial
            </span>
            <span>
              Cobertura de classificação: {overview.coverage.finishedCallsWithClassification}/
              {overview.coverage.finishedCalls} chamados concluídos
            </span>
          </footer>
        )}
      </div>
    </main>
  );
}
