import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Users,
  Wrench,
} from "lucide-react";

import type { AnalyticsMaintenanceParticipation } from "@/types/analytics";

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * The BI page has no document scroll. Measure only the available list viewport,
 * then paginate rather than clipping technician and technical-area records.
 */
function useVisibleRows(rowHeight: number, enabled: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState(3);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () =>
      setVisibleRows(Math.max(1, Math.floor(viewport.clientHeight / rowHeight)));

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [rowHeight, enabled]);

  return { viewportRef, visibleRows };
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
    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
      {maintenanceShare > 0 && (
        <div className="bg-sky-400" style={{ width: `${maintenanceShare}%` }} />
      )}
      {followUpShare > 0 && (
        <div className="bg-emerald-400" style={{ width: `${followUpShare}%` }} />
      )}
    </div>
  );
}

function PageControls({
  page,
  totalPages,
  shown,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  shown: number;
  total: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? "0 registros" : `${page * shown + 1}–${Math.min((page + 1) * shown, total)} de ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={page === 0}
          onClick={() => onChange(Math.max(0, page - 1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-9 text-center tabular-nums">
          {page + 1}/{totalPages}
        </span>
        <button
          type="button"
          aria-label="Próxima página"
          disabled={page >= totalPages - 1}
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-card hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
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
  // Keep hooks unconditional, including while analytics are loading.
  const { viewportRef: technicianViewport, visibleRows: technicianRows } =
    useVisibleRows(62, Boolean(data));
  const { viewportRef: areaViewport, visibleRows: areaRows } =
    useVisibleRows(63, Boolean(data));
  const [technicianPage, setTechnicianPage] = useState(0);
  const [areaPage, setAreaPage] = useState(0);

  useEffect(() => {
    setTechnicianPage(0);
    setAreaPage(0);
  }, [data]);

  if (loading && !data) {
    return (
      <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="h-full animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="h-full rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 text-sm text-amber-200">
        Participação técnica indisponível: {error}
      </section>
    );
  }

  if (!data) return null;

  const maxMinutes = data.technicians[0]?.totalPersonMinutes || 1;
  const technicianPages = Math.max(1, Math.ceil(data.technicians.length / technicianRows));
  const areaPages = Math.max(1, Math.ceil(data.technicalAreas.length / areaRows));
  const safeTechnicianPage = Math.min(technicianPage, technicianPages - 1);
  const safeAreaPage = Math.min(areaPage, areaPages - 1);
  const technicians = data.technicians.slice(
    safeTechnicianPage * technicianRows,
    (safeTechnicianPage + 1) * technicianRows,
  );
  const areas = data.technicalAreas.slice(
    safeAreaPage * areaRows,
    (safeAreaPage + 1) * areaRows,
  );

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-black uppercase tracking-wide">
              Participação técnica
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pessoa-minutos registrados por mantenedor. Participação, não ranking de desempenho.
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-[10px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Manutenção
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Acompanhamento
          </span>
        </div>
      </header>

      <div className="mt-2 grid shrink-0 grid-cols-4 gap-2">
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2">
          <div className="flex items-center justify-between text-sky-300">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              Esforço manutenção
            </span>
            <Wrench className="h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-xl font-black tabular-nums">
            {formatMinutes(data.totals.maintenancePersonMinutes)}
          </div>
        </div>

        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
          <div className="flex items-center justify-between text-emerald-300">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              Acompanhamento
            </span>
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-xl font-black tabular-nums">
            {formatMinutes(data.totals.followUpPersonMinutes)}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/30 px-3 py-2">
          <div className="flex items-center justify-between text-sky-300">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              Mantenedores
            </span>
            <Users className="h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-xl font-black tabular-nums">
            {data.totals.technicianCount}
          </div>
          <p className="text-[9px] text-muted-foreground">
            {data.totals.callCount} chamado(s) com fase explícita
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background/30 px-3 py-2">
          <div className="flex items-center justify-between text-amber-300">
            <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
              Sessões ativas
            </span>
            <CircleDot className="h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-xl font-black tabular-nums">
            {data.totals.activeSessionCount}
          </div>
          <p className="text-[9px] text-muted-foreground">
            {data.totals.returnCycleSessions} sessão(ões) em ciclo de retorno
          </p>
        </div>
      </div>

      <div className="mt-2 grid min-h-0 flex-1 gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.65fr)]">
        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-background/25 p-3">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <h3 className="text-xs font-black uppercase tracking-wide">
              Distribuição por mantenedor
            </h3>
            <span className="text-[10px] text-muted-foreground">
              Ordenado por pessoa-minutos
            </span>
          </div>

          <div ref={technicianViewport} className="mt-1 min-h-0 flex-1 overflow-hidden">
            {technicians.length ? (
              technicians.map((technician) => (
                <div
                  key={technician.technicianId ?? `legacy-${technician.technicianName}`}
                  className="flex h-[62px] flex-col justify-center gap-1 border-b border-border/50 py-1 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3 text-[11px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-bold">{technician.technicianName}</span>
                      {technician.activePhase && (
                        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                          {technician.activePhase === "maintenance"
                            ? "em manutenção"
                            : "em acompanhamento"}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-black tabular-nums">
                      {formatMinutes(technician.totalPersonMinutes)}
                    </span>
                  </div>

                  <div
                    className="max-w-full"
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
                  <div className="truncate text-[10px] text-muted-foreground">
                    {technician.callCount} chamado(s) ·{" "}
                    {formatMinutes(technician.maintenanceMinutes)} manutenção ·{" "}
                    {formatMinutes(technician.followUpMinutes)} acompanhamento
                  </div>
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Sem sessões com fase explícita no período
              </div>
            )}
          </div>
          <PageControls
            page={safeTechnicianPage}
            totalPages={technicianPages}
            shown={technicianRows}
            total={data.technicians.length}
            onChange={setTechnicianPage}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background/25 p-3">
            <h3 className="shrink-0 text-xs font-black uppercase tracking-wide">
              Áreas técnicas
            </h3>
            <div ref={areaViewport} className="mt-1 min-h-0 flex-1 overflow-hidden">
              {areas.length ? (
                areas.map((area) => (
                  <div
                    key={area.technicalArea ?? "unclassified"}
                    className="flex h-[63px] flex-col justify-center gap-1 border-b border-border/50 py-1 last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-bold">
                        {area.technicalArea
                          ? areaLabels.get(area.technicalArea) ?? area.technicalArea
                          : "Sem área registrada"}
                      </span>
                      <span className="shrink-0 font-black tabular-nums">
                        {formatMinutes(area.totalPersonMinutes)}
                      </span>
                    </div>
                    <SplitBar
                      maintenanceMinutes={area.maintenanceMinutes}
                      followUpMinutes={area.followUpMinutes}
                    />
                    <p className="truncate text-[9px] text-muted-foreground">
                      {area.technicianCount} mantenedor(es) · {area.sessionCount} sessão(ões)
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Sem áreas técnicas com fase explícita
                </div>
              )}
            </div>
            <PageControls
              page={safeAreaPage}
              totalPages={areaPages}
              shown={areaRows}
              total={data.technicalAreas.length}
              onChange={setAreaPage}
            />
          </div>

          <div
            className={
              data.coverage.legacySessions > 0
                ? "shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2"
                : "shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-3 py-2"
            }
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[10px] font-black uppercase tracking-wide">
                Cobertura de fases
              </h3>
              <span className="text-xl font-black tabular-nums">
                {data.coverage.phaseAwareSessionPercent === null
                  ? "—"
                  : `${data.coverage.phaseAwareSessionPercent}%`}
              </span>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">
              {data.coverage.phaseAwareSessions}/{data.coverage.totalSessions} sessão(ões) com fase explícita.
              {data.coverage.legacySessions > 0 &&
                ` ${data.coverage.legacySessions} legada(s) · ${formatMinutes(data.coverage.legacyMinutes)} sem fase.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
