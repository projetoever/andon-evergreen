import { isEligible, RESPONSIBILITIES, uniqueById } from "./eligibility.js";
import type { AnalyticsFailureEventRecord } from "./overview.js";

export type CausalImpact = {
  id: string;
  machineId: string;
  startedAt: Date;
  endedAt: Date | null;
  failureResponsibility: string | null;
};
export type CausalEpisode = {
  machineId: string;
  start: number;
  end: number;
  responsibility: string;
  segments: Array<{ start: number; end: number; responsibility: string }>;
};
const responsibility = (value?: string | null) =>
  RESPONSIBILITIES.some((item) => item === value) ? value! : "unassigned";
const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;

/** One physical minute belongs to one domain. Explicit call impact intervals
 * take precedence over the current linked owner of a physical event. Ambiguous
 * overlaps remain unassigned; no area wins by row order. */
export function buildCausalEpisodes(
  events: AnalyticsFailureEventRecord[],
  impacts: CausalImpact[] = [],
): CausalEpisode[] {
  const machines = new Map<string, AnalyticsFailureEventRecord[]>();
  for (const event of uniqueById(events).filter(isEligible)) {
    if (
      !Number.isFinite(event.startedAt.getTime()) ||
      (event.endedAt &&
        (!Number.isFinite(event.endedAt.getTime()) || event.endedAt <= event.startedAt))
    )
      continue;
    const rows = machines.get(event.machineId) ?? [];
    rows.push(event);
    machines.set(event.machineId, rows);
  }
  const episodes: CausalEpisode[] = [];
  for (const [machineId, rows] of machines) {
    const physical = rows
      .map((row) => ({ start: row.startedAt.getTime(), end: row.endedAt?.getTime() ?? Infinity }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const unions: Array<{ start: number; end: number }> = [];
    for (const interval of physical) {
      const last = unions[unions.length - 1];
      // With no observed operating gap, touching intervals are one physical episode.
      if (!last || interval.start > last.end) unions.push({ ...interval });
      else last.end = Math.max(last.end, interval.end);
    }
    const allocations = uniqueById(impacts).filter(
      (row) =>
        row.machineId === machineId &&
        (row.endedAt?.getTime() ?? Infinity) > row.startedAt.getTime(),
    );
    for (const episode of unions) {
      const candidates = allocations.filter((row) =>
        overlaps(
          episode.start,
          episode.end,
          row.startedAt.getTime(),
          row.endedAt?.getTime() ?? Infinity,
        ),
      );
      const sourceRows = rows.filter((row) =>
        overlaps(
          episode.start,
          episode.end,
          row.startedAt.getTime(),
          row.endedAt?.getTime() ?? Infinity,
        ),
      );
      const boundaries = [
        ...new Set([
          episode.start,
          episode.end,
          ...[...candidates, ...sourceRows]
            .flatMap((row) => [row.startedAt.getTime(), row.endedAt?.getTime() ?? Infinity])
            .filter((value) => value > episode.start && value < episode.end),
        ]),
      ].sort((a, b) => a - b);
      const segments: CausalEpisode["segments"] = [];
      for (let index = 0; index < boundaries.length - 1; index++) {
        const start = boundaries[index],
          end = boundaries[index + 1];
        const explicit = candidates.filter((row) =>
          overlaps(start, end, row.startedAt.getTime(), row.endedAt?.getTime() ?? Infinity),
        );
        const sources = explicit.length
          ? explicit
          : sourceRows.filter((row) =>
              overlaps(start, end, row.startedAt.getTime(), row.endedAt?.getTime() ?? Infinity),
            );
        const domains = new Set(sources.map((row) => responsibility(row.failureResponsibility)));
        segments.push({
          start,
          end,
          responsibility: domains.size === 1 ? [...domains][0] : "unassigned",
        });
      }
      const domains = new Set(segments.map((row) => row.responsibility));
      episodes.push({
        machineId,
        ...episode,
        responsibility: domains.size === 1 ? [...domains][0] : "mixed",
        segments,
      });
    }
  }
  return episodes;
}

export function summarizeCausalDowntime(episodes: CausalEpisode[], start: Date, end: Date) {
  const totals = new Map<string, number>(RESPONSIBILITIES.map((item) => [item, 0]));
  for (const episode of episodes)
    for (const segment of episode.segments) {
      const milliseconds = Math.max(
        0,
        Math.min(end.getTime(), segment.end) - Math.max(start.getTime(), segment.start),
      );
      totals.set(segment.responsibility, (totals.get(segment.responsibility) ?? 0) + milliseconds);
    }
  return [...totals].map(([responsibility, ms]) => ({
    responsibility,
    downtimeMinutes: Math.round(ms / 600) / 100,
  }));
}
