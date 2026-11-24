import { ui } from "@/i18n/translate";

/**
 * PENTE 5: structural evidence only. Participation in a filtered KPI needs
 * the authorized analytics cohort, period/baseline and physical episode union.
 * These labels never assert that a single call was actually counted in a KPI.
 */
export type BiTraceCall = {
  status: string;
  isSystemTest: boolean;
  openedAt: string;
  attendedAt?: string | null;
  finishedAt?: string | null;
  failureResponsibility?: string | null;
  analyticsDisposition?: string | null;
  failureClassification?: string | null;
  maintenanceReturnCount?: number | null;
  attendanceMinutes?: number | null;
  callReasonSnapshot?: {
    reasonNameSnapshot: string;
    optionNameSnapshot: string;
    nature: string;
    maintenanceKpiPolicy?: string | null;
    analyticsDisposition?: string | null;
  } | null;
  impactIntervals?: readonly unknown[];
  failureEvents?: readonly unknown[];
  technicianSessions?: readonly unknown[];
};

const excludedDispositions = new Set(["test", "false_call", "duplicate"]);
const legacyExcludedDiagnoses = new Set([
  "test", "teste", "testing", "system_test", "teste_sistema",
  "false_call", "falso_chamado", "duplicate", "duplicado",
]);

export type BiTraceVerdict = "excluded" | "candidate" | "needs_evidence" | "recorded" | "unknown";

export function buildBiCallTrace(call: BiTraceCall) {
  const snapshot = call.callReasonSnapshot;
  const callExcluded = call.isSystemTest || ["cancelled", "canceled"].includes(call.status) ||
    excludedDispositions.has(call.analyticsDisposition ?? "") ||
    legacyExcludedDiagnoses.has(call.failureClassification ?? "");
  const groupDispositionExcluded = snapshot != null &&
    snapshot.analyticsDisposition != null && snapshot.analyticsDisposition !== "include";
  const correctiveCandidate = !callExcluded && (snapshot == null ||
    (snapshot.nature === "corrective_failure" &&
     snapshot.maintenanceKpiPolicy === "eligible" &&
     snapshot.analyticsDisposition === "include"));
  const confirmedMaintenance = call.failureResponsibility === "maintenance";
  const finished = call.status === "finished" && Boolean(call.finishedAt);
  const hasStopEvidence = Boolean(call.impactIntervals?.length || call.failureEvents?.length);
  const hasTechnicalEvidence = Boolean(call.technicianSessions?.length) ||
    (typeof call.attendanceMinutes === "number" && Number.isFinite(call.attendanceMinutes));
  const returnEligible = correctiveCandidate && confirmedMaintenance && finished;
  return {
    origin: snapshot == null ? "no_group_snapshot" as const : "group" as const,
    callExcluded, groupDispositionExcluded, correctiveCandidate,
    confirmedMaintenance, finished, hasStopEvidence, hasTechnicalEvidence, returnEligible,
    rows: [
      { key: "operational" as const,
        verdict: callExcluded ? "excluded" as const : groupDispositionExcluded
          ? "unknown" as const : "candidate" as const },
      { key: "mtta" as const,
        verdict: !correctiveCandidate ? "excluded" as const :
          call.attendedAt ? "candidate" as const : "needs_evidence" as const },
      { key: "mttr" as const,
        verdict: !correctiveCandidate || (call.failureResponsibility != null &&
          !["maintenance", "unassigned"].includes(call.failureResponsibility))
          ? "excluded" as const : "needs_evidence" as const },
      { key: "mtbf" as const,
        verdict: !correctiveCandidate || (call.failureResponsibility != null &&
          !["maintenance", "unassigned"].includes(call.failureResponsibility))
          ? "excluded" as const : "needs_evidence" as const },
      { key: "physical" as const, verdict: hasStopEvidence ? "recorded" as const : "unknown" as const },
      { key: "availability" as const, verdict: "needs_evidence" as const },
      { key: "technical" as const,
        verdict: callExcluded ? "excluded" as const : hasTechnicalEvidence
          ? "recorded" as const : "unknown" as const },
      { key: "return" as const,
        verdict: returnEligible ? "candidate" as const : "excluded" as const },
    ],
  };
}

export function CallBiParticipationPanel({ call }: { call: BiTraceCall }) {
  const trace = buildBiCallTrace(call);
  const group = call.callReasonSnapshot;
  const labels = {
    operational: ui("BI operacional"),
    mtta: ui("MTTA corretivo"),
    mttr: ui("MTTR corretivo"),
    mtbf: ui("MTBF programado"),
    physical: ui("Downtime físico"),
    availability: ui("Disponibilidade"),
    technical: ui("Horas técnicas"),
    return: ui("Taxa de retorno"),
  };
  const verdicts = {
    excluded: ui("Não elegível"),
    candidate: ui("Candidato; verificar período"),
    needs_evidence: ui("Depende de evidência e filtros"),
    recorded: ui("Há registros associados; conferir coorte"),
    unknown: ui("Não comprovado neste detalhe"),
  };
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={ui("Participação nos indicadores do BI")}>
      <h3 className="text-sm font-bold">{ui("Participação nos indicadores do BI")}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {ui("Esta ficha mostra elegibilidade estrutural; contabilização efetiva exige consultar o período, os filtros e os episódios físicos do BI.")}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <dt className="text-xs text-muted-foreground">{ui("Tipo de abertura")}</dt>
          <dd className="font-semibold">{group ? ui("Grupo de chamados") : ui("Sem snapshot de Grupo: botão direto ou chamado legado")}</dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <dt className="text-xs text-muted-foreground">{ui("Política registrada na abertura")}</dt>
          <dd className="font-semibold">{group
            ? `${group.nature} · ${group.maintenanceKpiPolicy ?? "—"} · ${group.analyticsDisposition ?? "—"}`
            : ui("Política legada; origem não comprovada")}</dd>
        </div>
        {group && <div className="rounded-lg border border-border bg-muted/20 p-2 sm:col-span-2">
          <dt className="text-xs text-muted-foreground">{ui("Identificação original")}</dt>
          <dd className="font-semibold">{group.optionNameSnapshot} — {group.reasonNameSnapshot}</dd>
        </div>}
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <dt className="text-xs text-muted-foreground">{ui("Responsabilidade confirmada")}</dt>
          <dd className="font-semibold">{call.failureResponsibility || ui("Pendente / não informada")}</dd>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <dt className="text-xs text-muted-foreground">{ui("Diagnóstico e tratamento analítico")}</dt>
          <dd className="break-words font-semibold">
            {call.failureClassification || "—"} · {call.analyticsDisposition || ui("Sem disposição registrada")}
          </dd>
        </div>
      </dl>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {trace.rows.map(row => <div key={row.key} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg border border-border/70 bg-muted/10 p-2 text-xs">
          <dt className="font-bold">{labels[row.key]}</dt>
          <dd className="text-muted-foreground">{verdicts[row.verdict]}</dd>
        </div>)}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        {trace.groupDispositionExcluded
          ? ui("A política do Grupo exclui este chamado dos indicadores corretivos; a inclusão no BI operacional exige conferência da consulta.")
          : trace.callExcluded
            ? ui("O chamado possui exclusão analítica, cancelamento ou sinalização de teste.")
            : !trace.correctiveCandidate
              ? ui("Origem não corretiva: tempos técnicos e parada física comprovada não são automaticamente descartados.")
              : ui("Candidatura corretiva não confirma participação em MTTR ou MTBF sem causalidade e programação válidas.")}
      </p>
    </section>
  );
}
