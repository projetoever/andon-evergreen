import { useState } from "react";
import { AlertTriangle, CircleHelp, Database, CheckCircle2 } from "lucide-react";
import { ui } from "@/i18n/translate";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AnalyticsProductionMetrics } from "@/types/analytics";

type Coverage = NonNullable<AnalyticsProductionMetrics["machineCoverage"]>[number];
type CoverageFilter = "incomplete" | "all" | "complete";
const LABELS: Record<Coverage["status"], string> = {
  complete: "Completo · produção programada",
  complete_no_scheduled: "Completo · sem produção programada",
  incomplete: "Histórico incompleto",
  outside_window: "Fora da janela",
};
const REASONS: Record<Coverage["reason"], string> = {
  verified_scheduled: "Programação verificada",
  verified_not_scheduled: "Modo não programado verificado",
  no_history: "Sem registros de programação",
  history_gap: "Lacuna ou modo desconhecido",
  not_in_window: "Sem tempo observado",
};

/** Apenas explica a cobertura previamente calculada; nunca altera modo produtivo ou KPIs. */
export function BiProductionCoverageDialog({ data }: { data: AnalyticsProductionMetrics }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<CoverageFilter>("incomplete");
  const rows = data.machineCoverage ?? [];
  const incomplete = rows.filter((row) => row.status === "incomplete");
  const complete = rows.filter((row) => row.status === "complete" || row.status === "complete_no_scheduled");
  const coveredWithoutSchedule = rows.filter((row) => row.status === "complete_no_scheduled").length;
  const shown = rows
    .filter((row) => filter === "all" || (filter === "incomplete" ? row.status === "incomplete" : row.status === "complete" || row.status === "complete_no_scheduled"))
    .sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true }));
  const coveragePercent = data.populationCount > 0
    ? (data.coveredMachineCount * 100 / data.populationCount).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"
    : "—";

  return (
    <>
      <button type="button" onClick={() => { setFilter("incomplete"); setOpen(true); }}
        aria-label={ui("Detalhar cobertura histórica")}
        className="ml-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        {ui("Detalhar cobertura")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[92dvh] w-[min(96vw,960px)] max-w-none flex-col gap-4 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 pr-8 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Database className="h-5 w-5 text-primary" aria-hidden="true" />
              {ui("Cobertura histórica por máquina")}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {ui("Cobertura indica histórico verificável no período selecionado, não quantas máquinas estão produzindo agora.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-2xl font-black tabular-nums">{data.populationCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{ui("Máquinas na população")}</p>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-2xl font-black tabular-nums text-emerald-400">{data.coveredMachineCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{ui("Históricos completos")}</p>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="text-2xl font-black tabular-nums text-amber-400">{data.uncoveredMachineCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">{ui("Históricos incompletos")}</p>
            </div>
          </div>

          <div className="shrink-0 space-y-2">
            <p className="text-sm leading-6 text-foreground">
              <strong>{coveragePercent}</strong> {ui("da população possui histórico completo.")}
              {coveredWithoutSchedule > 0 && (
                <span className="text-muted-foreground"> {ui("{0} máquina(s) têm histórico completo sem horas programadas; não adicionam tempo ao denominador.", { 0: coveredWithoutSchedule })}</span>
              )}
            </p>
            {incomplete.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <p className="leading-5">
                  <strong>{ui("Máquinas a verificar:")}</strong>{" "}
                  <span className="font-mono font-semibold">{incomplete.map((item) => item.machineId).join(", ")}</span>.
                  <span className="block text-xs text-muted-foreground">{ui("Confira os registros de modo produtivo nessas máquinas; períodos desconhecidos não são preenchidos automaticamente.")}</span>
                </p>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{ui("Situação por máquina")}</h3>
              <div className="flex flex-wrap gap-1" role="group" aria-label={ui("Filtrar máquinas pela cobertura")}>
                {([
                  ["incomplete", ui("Incompletas"), data.uncoveredMachineCount],
                  ["complete", ui("Completas"), data.coveredMachineCount],
                  ["all", ui("Todas"), data.populationCount],
                ] as const).map(([value, label, count]) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                    className={"rounded-md border px-3 py-1.5 text-xs font-semibold " +
                      (filter === value ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[130px] flex-1 overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[580px] text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{ui("Máquina")}</th>
                    <th className="px-4 py-3">{ui("Estado")}</th>
                    <th className="px-4 py-3">{ui("Motivo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.machineId} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-3 font-bold tabular-nums">{row.machineId}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {row.status === "incomplete"
                            ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                            : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />}
                          {ui(LABELS[row.status])}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{ui(REASONS[row.reason])}</td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-sm text-muted-foreground">{ui("Nenhuma máquina neste grupo.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
