import { Activity, CircleDot, Users, Wrench } from "lucide-react";

import type { AnalyticsMaintenanceParticipation } from "@/types/analytics";

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function SplitBar({
  maintenanceMinutes,
  followUpMinutes,
}: {
  maintenanceMinutes: number;
  followUpMinutes: number;
}) {
  const total = maintenanceMinutes + followUpMinutes;
  const maintenanceShare = total > 0 ? (maintenanceMinutes / total) * 100 : 0;
  const followUpShare = total > 0 ? (followUpMinutes / total) * 100 : 0;

  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
      {maintenanceShare > 0 && (
        <div className="bg-sky-400" style={{ width: `${maintenanceShare}%` }} />
      )}
      {followUpShare > 0 && (
        <div className="bg-emerald-400" style={{ width: `${followUpShare}%` }} />
      )}
    </div>
  );
}

export function BiMaintenanceParticipation({
  data,
  loading,
  error,
  areaLabels,
}: {
  data: AnalyticsMaintenanceParticipation | null;
  loading: boolean;
  error: string | null;
  areaLabels: Map<string, string>;
}) {
  if (loading && !data) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="h-36 animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-5 text-sm text-amber-200">
        Participação técnica indisponível: {error}
      </section>
    );
  }

  if (!data) return null;

  const maxMinutes = data.technicians[0]?.totalPersonMinutes || 1;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              Participação técnica
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pessoa-minutos registrados por mantenedor. Volume de participação, não ranking de desempenho.
          </p>
        </div>
        <div className="flex gap-4 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Manutenção
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Acompanhamento
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] p-3">
          <div className="flex items-center justify-between text-sky-300">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              Esforço manutenção
            </span>
            <Wrench className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums">
            {formatMinutes(data.totals.maintenancePersonMinutes)}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
          <div className="flex items-center justify-between text-emerald-300">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              Acompanhamento
            </span>
            <Activity className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums">
            {formatMinutes(data.totals.followUpPersonMinutes)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/30 p-3">
          <div className="flex items-center justify-between text-sky-300">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              Mantenedores
            </span>
            <Users className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums">
            {data.totals.technicianCount}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.totals.callCount} chamado(s) com fase explícita
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background/30 p-3">
          <div className="flex items-center justify-between text-amber-300">
            <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
              Sessões ativas
            </span>
            <CircleDot className="h-4 w-4" />
          </div>
          <div className="mt-2 text-xl font-black tabular-nums">
            {data.totals.activeSessionCount}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.totals.returnCycleSessions} sessão(ões) em ciclo de retorno
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <div className="rounded-lg border border-border bg-background/25 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wide">
              Distribuição por mantenedor
            </h3>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Top 8 por pessoa-minutos
            </span>
          </div>

          {data.technicians.length ? (
            <div className="space-y-4">
              {data.technicians.slice(0, 8).map((technician) => (
                <div
                  key={technician.technicianId ?? `legacy-${technician.technicianName}`}
                  className="grid gap-2"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <span className="truncate font-bold">{technician.technicianName}</span>
                      {technician.activePhase && (
                        <span className="ml-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300">
                          {technician.activePhase === "maintenance" ? "em manutenção" : "em acompanhamento"}
                        </span>
                      )}
                    </div>
                    <span className="font-black tabular-nums">
                      {formatMinutes(technician.totalPersonMinutes)}
                    </span>
                  </div>

                  <div
                    style={{
                      width: `${Math.max(
                        12,
                        (technician.totalPersonMinutes / maxMinutes) * 100,
                      )}%`,
                    }}
                  >
                    <SplitBar
                      maintenanceMinutes={technician.maintenanceMinutes}
                      followUpMinutes={technician.followUpMinutes}
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                    <span>{technician.callCount} chamado(s)</span>
                    <span>{formatMinutes(technician.maintenanceMinutes)} manutenção</span>
                    <span>{formatMinutes(technician.followUpMinutes)} acompanhamento</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sem sessões com fase explícita no período
            </div>
          )}
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-background/25 p-4">
            <h3 className="text-xs font-black uppercase tracking-wide">Áreas técnicas</h3>
            <div className="mt-3 space-y-3">
              {data.technicalAreas.slice(0, 6).map((area) => (
                <div key={area.technicalArea ?? "unclassified"} className="rounded-md border border-border bg-card/40 p-3">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-bold">
                      {area.technicalArea
                        ? areaLabels.get(area.technicalArea) ?? area.technicalArea
                        : "Sem área registrada"}
                    </span>
                    <span className="font-black tabular-nums">
                      {formatMinutes(area.totalPersonMinutes)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <SplitBar
                      maintenanceMinutes={area.maintenanceMinutes}
                      followUpMinutes={area.followUpMinutes}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {area.technicianCount} mantenedor(es) · {area.sessionCount} sessão(ões)
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className={
            data.coverage.legacySessions > 0
              ? "rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-4"
              : "rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] p-4"
          }>
            <h3 className="text-xs font-black uppercase tracking-wide">Cobertura de fases</h3>
            <div className="mt-2 text-2xl font-black tabular-nums">
              {data.coverage.phaseAwareSessionPercent === null
                ? "—"
                : `${data.coverage.phaseAwareSessionPercent}%`}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {data.coverage.phaseAwareSessions}/{data.coverage.totalSessions} sessão(ões) possuem fase explícita.
              {data.coverage.legacySessions > 0 &&
                ` ${data.coverage.legacySessions} sessão(ões) legada(s), equivalentes a ${formatMinutes(data.coverage.legacyMinutes)}, permanecem sem classificação de fase.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
