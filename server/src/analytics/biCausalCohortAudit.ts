import { buildCausalEpisodes, type CausalImpact } from "./causality.js";
import { isEligible, uniqueById } from "./eligibility.js";
import {
  buildPlannedProductionKpis,
  confirmedSchedule,
  type ProductionAsset,
  type ProductionModeInterval,
} from "./productionKpis.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";

export type CohortAuditInput = {
  machineId: string;
  asset: ProductionAsset;
  events: AnalyticsFailureEventRecord[];
  impacts: CausalImpact[];
  productionEvents: ProductionModeInterval[];
  start: Date;
  effectiveEnd: Date;
  timeZone: string;
};

export type EpisodeExclusion =
  | "included"
  | "out_of_period"
  | "still_open"
  | "pending_or_mixed"
  | "not_maintenance"
  | "missing_schedule"
  | "outside_scheduled_production"
  | "started_before_window"
  | "blocked_by_pending_cause";

const overlaps = (a: number, b: number, c: number, d: number) =>
  a < d && c < b;

function tally(values: EpisodeExclusion[]) {
  const tally: Partial<Record<EpisodeExclusion, number>> = {};
  for (const value of values) tally[value] = (tally[value] ?? 0) + 1;
  return tally;
}

/**
 * Diagnostic decomposition of the SAME eligible physical episodes and schedule
 * used by official KPIs. This helper never changes a KPI or a stored record.
 * A physical episode can have different MTTR and MTBF eligibility.
 */
export function buildBiCausalCohortAudit(input: CohortAuditInput) {
  const start = input.start.getTime(), end = input.effectiveEnd.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error("Audit window must be valid and nonempty");
  if (input.asset.machineId !== input.machineId)
    throw new Error("Audit asset must match machine");

  const events = uniqueById(input.events).filter(event =>
    event.machineId === input.machineId && isEligible(event),
  );
  const episodes = buildCausalEpisodes(events, input.impacts.filter(
    impact => impact.machineId === input.machineId,
  ));
  const productionEvents = input.productionEvents.filter(event =>
    event.machineId === input.machineId,
  );
  const kpis = buildPlannedProductionKpis({
    assets: [input.asset],
    productionEvents,
    failureEvents: events,
    causalEpisodes: episodes,
    start: input.start,
    effectiveEnd: input.effectiveEnd,
    timeZone: input.timeZone,
  });
  const assetStart = Math.max(start, input.asset.exposureStartedAt.getTime());
  const scheduled = assetStart < end
    ? confirmedSchedule(productionEvents, { start: assetStart, end })
    : null;
  const activeSchedule = scheduled ?? [];
  const rows = episodes
    .filter(episode => overlaps(episode.start, episode.end, start, end))
    .map(episode => {
      const validEnd = Number.isFinite(episode.end);
      const restoredInside = validEnd && episode.end >= start && episode.end < end;
      const mttrReason: EpisodeExclusion = !validEnd ? "still_open"
        : !restoredInside ? "out_of_period"
        : ["unassigned", "mixed"].includes(episode.responsibility) ? "pending_or_mixed"
        : episode.responsibility !== "maintenance" ? "not_maintenance"
        : "included";
      const beganInside = episode.start >= assetStart && episode.start < end;
      const inScheduled = activeSchedule.some(
        interval => episode.start >= interval.start && episode.start < interval.end,
      );
      const mtbfReason: EpisodeExclusion = episode.responsibility === "unassigned" ||
        episode.responsibility === "mixed" ? "pending_or_mixed"
        : episode.responsibility !== "maintenance" ? "not_maintenance"
        : !beganInside ? "started_before_window"
        : !scheduled ? "missing_schedule"
        : !inScheduled ? "outside_scheduled_production"
        : kpis.pendingAttributionEpisodes > 0 ? "blocked_by_pending_cause"
        : "included";
      const references = events
        .filter(event => overlaps(
          event.startedAt.getTime(), event.endedAt?.getTime() ?? Infinity,
          episode.start, episode.end,
        ))
        .map(event => event.id.slice(-8))
        .sort();
      return {
        startedAt: new Date(episode.start).toISOString(),
        endedAt: validEnd ? new Date(episode.end).toISOString() : null,
        responsibility: episode.responsibility,
        // Suffixes aid supervised comparison without dumping full identifiers,
        // technician details, work orders or diagnostic free text into logs.
        eventIdSuffixes: [...new Set(references)],
        mttrReason,
        mtbfReason,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return {
    machineId: input.machineId,
    period: { start: input.start.toISOString(), end: input.effectiveEnd.toISOString() },
    production: {
      coveredMachineCount: kpis.coveredMachineCount,
      availabilityStatus: kpis.availabilityStatus,
      scheduledMinutes: kpis.scheduledMinutes,
      operatingMinutes: kpis.operatingMinutes,
      scheduledDowntimeMinutes: kpis.scheduledDowntimeMinutes,
    },
    official: {
      plannedMtbfMinutes: kpis.plannedMtbfMinutes,
      resolvedMttrMinutes: kpis.resolvedMttrMinutes,
      mtbfAvailabilityReason: kpis.mtbfAvailabilityReason,
      mttrAvailabilityReason: kpis.mttrAvailabilityReason,
      mtbfEligibleFailures: kpis.productionFailureEpisodes,
      mttrEligibleRestorations: kpis.resolvedEpisodes,
      pendingScheduledEpisodes: kpis.pendingAttributionEpisodes,
    },
    episodeCount: rows.length,
    mttrReasons: tally(rows.map(row => row.mttrReason)),
    mtbfReasons: tally(rows.map(row => row.mtbfReason)),
    // This audit is never an authorization decision, nor a replacement for
    // historical catalog/audit review of an actual incident.
    episodes: rows,
  };
}
