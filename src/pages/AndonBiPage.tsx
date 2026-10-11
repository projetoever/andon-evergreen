import { Link } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Clock3,
  RotateCcw,
  TimerReset,
  Wrench,
} from "lucide-react";

const KPI_PLACEHOLDERS = [
  { label: "Chamados", icon: Activity },
  { label: "Ativos", icon: BarChart3 },
  { label: "MTTA", icon: Clock3 },
  { label: "Tempo em manutenção", icon: Wrench },
  { label: "Downtime físico", icon: TimerReset },
  { label: "Retorno à manutenção", icon: RotateCcw },
] as const;

export function AndonBiPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1800px] flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              Maintenance & Reliability Intelligence
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">ANDON BI</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
              Visão executiva de manutenção, confiabilidade, perdas e comportamento operacional.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              MVP Executivo
            </span>
            <Link
              to="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-bold transition hover:bg-muted"
            >
              ANDON operacional
            </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {KPI_PLACEHOLDERS.map(({ label, icon: Icon }) => (
            <article key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-4 text-3xl font-black tabular-nums">—</div>
              <p className="mt-2 text-xs text-muted-foreground">
                Aguardando Analytics API
              </p>
            </article>
          ))}
        </section>

        <section className="grid flex-1 gap-4 xl:grid-cols-2">
          <article className="min-h-72 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide">Tendência operacional</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Chamados e downtime real serão carregados exclusivamente do PostgreSQL.
            </p>
            <div className="mt-8 flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Sem dados simulados
            </div>
          </article>

          <article className="min-h-72 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wide">Principais impactos</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pareto de máquinas, classificações e setores entra na próxima etapa.
            </p>
            <div className="mt-8 flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Camada analítica em preparação
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
