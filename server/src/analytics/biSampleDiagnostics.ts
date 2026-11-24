import { isCorrectiveReasonCandidate } from "./correctiveReasonCohort.js";
import { confirmedSchedule, type ProductionAsset, type ProductionModeInterval } from "./productionKpis.js";

type DiagnosticCall = {
  id: string;
  machineId: string;
  subtype: string | null;
  status: string;
  openedAt: Date;
  attendedAt: Date | null;
  finishedAt: Date | null;
  failureClassification: string | null;
  failureResponsibility: string | null;
  callReasonSnapshot: {
    reasonNameSnapshot?: string | null;
    nature: string;
    maintenanceKpiPolicy: string;
    analyticsDisposition: string;
  } | null;
};
type DiagnosticEvent = {
  machineId: string;
  callId?: string | null;
  startedAt: Date;
  endedAt: Date | null;
  failureResponsibility?: string | null;
  correctiveReasonCandidate?: boolean;
};
type DiagnosticKpis = {
  productionFailureEpisodes: number;
  pendingAttributionEpisodes: number;
  resolvedEpisodes: number;
  closedPendingRestorationEpisodes: number;
  coveredMachineCount: number;
  populationCount: number;
};

export type BiSampleGate =
  | "awaiting_finalization"
  | "finished_outside_period"
  | "non_corrective_group"
  | "unassigned_diagnosis"
  | "non_maintenance_diagnosis"
  | "no_linked_physical_stop"
  | "candidate_needs_causal_episode";

const inWindow = (date: Date | null, start: Date, end: Date) =>
  date !== null && date >= start && date < end;

/**
 * Read-only account of what is actually required to produce a sample.
 * Candidate rows are not proof of episode inclusion: overlapping impacts,
 * machine programming, and transfer of physical-stop ownership are checked by
 * the official calculator only. Do not infer machine responsibility from sector
 * names, reason suggestions or labels.
 *
 * Input calls and events MUST already be restricted by SQL eligibility and
 * machine scope; this helper never queries unscoped data.
 */
export function buildBiSampleDiagnostics(input: {
  calls: DiagnosticCall[];
  failureEvents: DiagnosticEvent[];
  start: Date;
  effectiveEnd: Date;
  production: DiagnosticKpis;
  assets: ProductionAsset[] | null;
  productionEvents: ProductionModeInterval[];
}) {
  const { calls, failureEvents, start, effectiveEnd, production, assets, productionEvents } = input;
  const finished = calls.filter(call =>
    call.status === "finished" && inWindow(call.finishedAt, start, effectiveEnd));
  const correctiveFinished = finished.filter(call =>
    isCorrectiveReasonCandidate(call.callReasonSnapshot));
  const maintenanceFinished = correctiveFinished.filter(call =>
    call.failureResponsibility === "maintenance");
  const pendingFinished = correctiveFinished.filter(call =>
    !call.failureResponsibility || call.failureResponsibility === "unassigned");
  const active = calls.filter(call => call.status !== "finished" &&
    call.status !== "cancelled" && call.status !== "canceled");
  const byCall = new Map<string, DiagnosticEvent[]>();
  for (const event of failureEvents) {
    if (!event.callId) continue;
    const items = byCall.get(event.callId) ?? [];
    items.push(event);
    byCall.set(event.callId, items);
  }
  const cases = [...calls]
    .sort((a,b) => b.openedAt.getTime() - a.openedAt.getTime())
    .slice(0, 20)
    .map(call => {
      const corrective = isCorrectiveReasonCandidate(call.callReasonSnapshot);
      const linked = (byCall.get(call.id) ?? [])
        .filter(event => event.machineId === call.machineId);
      const asset = assets?.find(row => row.machineId === call.machineId);
      const observationStart = asset ? Math.max(start.getTime(), asset.exposureStartedAt.getTime()) : 0;
      const schedule = asset && observationStart < effectiveEnd.getTime()
        ? confirmedSchedule(
            productionEvents.filter(row => row.machineId === call.machineId),
            { start: observationStart, end: effectiveEnd.getTime() },
          ) : null;
      const scheduleCoverage = assets === null ? "dimension_filtered"
        : !asset ? "outside_population"
        : schedule === null ? "incomplete"
        : schedule.length === 0 ? "without_scheduled_minutes"
        : "verified_schedule";
      const gate: BiSampleGate = call.status !== "finished"
        ? "awaiting_finalization"
        : !inWindow(call.finishedAt,start,effectiveEnd)
          ? "finished_outside_period"
          : !corrective
          ? "non_corrective_group"
          : !call.failureResponsibility || call.failureResponsibility === "unassigned"
            ? "unassigned_diagnosis"
            : call.failureResponsibility !== "maintenance"
              ? "non_maintenance_diagnosis"
              : !linked.length
                ? "no_linked_physical_stop"
                : "candidate_needs_causal_episode";
      return {
        callIdSuffix: call.id.slice(-8),
        machineId: call.machineId,
        subtype: call.subtype,
        openedAt: call.openedAt.toISOString(),
        status: call.status,
        groupName: call.callReasonSnapshot?.reasonNameSnapshot ?? null,
        groupNature: call.callReasonSnapshot?.nature ?? null,
        groupMaintenanceKpiPolicy: call.callReasonSnapshot?.maintenanceKpiPolicy ?? null,
        groupAnalyticsDisposition: call.callReasonSnapshot?.analyticsDisposition ?? null,
        failureClassification: call.failureClassification,
        failureResponsibility: call.failureResponsibility,
        hasPhysicalLinkedStop: linked.length > 0,
        closedLinkedPhysicalStops: linked.filter(event => event.endedAt !== null).length,
        scheduleCoverage,
        gate,
      };
    });
  return {
    period: { start: start.toISOString(), end: effectiveEnd.toISOString() },
    counters: {
      openedInPeriod: calls.filter(call => inWindow(call.openedAt,start,effectiveEnd)).length,
      attendedInPeriod: calls.filter(call => inWindow(call.attendedAt,start,effectiveEnd)).length,
      activeCalls: active.length,
      finishedInPeriod: finished.length,
      nonCorrectiveFinished: finished.length - correctiveFinished.length,
      correctiveFinished: correctiveFinished.length,
      correctiveFinishedPendingResponsibility: pendingFinished.length,
      correctiveFinishedOtherResponsibility: correctiveFinished.length - maintenanceFinished.length - pendingFinished.length,
      correctiveFinishedMaintenance: maintenanceFinished.length,
      closedMaintenancePhysicalEpisodes: production.resolvedEpisodes,
      closedPendingPhysicalEpisodes: production.closedPendingRestorationEpisodes,
      scheduledMaintenanceFailureStarts: production.productionFailureEpisodes,
      scheduledPendingEpisodes: production.pendingAttributionEpisodes,
      coveredMachines: production.coveredMachineCount,
      populationMachines: production.populationCount,
    },
    // A row can have a physical stop owned by another call after a handoff;
    // linked-stop evidence is an aid to investigation, not a rejection rule.
    cases,
  };
}
