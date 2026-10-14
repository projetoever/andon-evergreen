import type { AnalyticsFailureEventRecord } from "./overview.js";

const round2 = (value: number) => Math.round(value * 100) / 100;
type Interval = { start: number; end: number };
export type ScheduledProductionEvent = {
  machineId: string;
  productionMode: string;
  startedAt: Date;
  endedAt: Date | null;
};
export type ScheduledMachine = { machineId: string; createdAt: Date };

const productionMode = (raw: string) => raw === "production" ? "scheduled" : raw;

function mergeIntervals(intervals: Interval[]) {
  const merged: Interval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)) {
    if (interval.end <= interval.start) continue;
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}
function intersection(interval: Interval, other: Interval) {
  const start = Math.max(interval.start, other.start);
  const end = Math.min(interval.end, other.end);
  return end > start ? { start, end } : null;
}
function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * This is recorded PRODUCTION PROGRAMMED time, not inferred shift templates.
 * Require complete historical mode coverage for every eligible machine. A gap,
 * overlap of conflicting modes, or missing history makes the aggregate unavailable.
 * Downtime is unioned within each machine and intersected with scheduled windows.
 */
export function calculateScheduledPerformance({
  machines, events, failures, start, effectiveEnd, timeZone,
}: {
  machines: ScheduledMachine[] | null;
  events: ScheduledProductionEvent[];
  failures: AnalyticsFailureEventRecord[];
  start: Date;
  effectiveEnd: Date;
  timeZone: string;
}) {
  type Day = { date: string; scheduledMinutes: number; stoppedMinutes: number; availabilityPercent: number | null };
  const unavailable = (reason: string, coveredMachineCount: number, population: number) => ({
    availabilityPercent: null as number | null,
    mtbfScheduledMinutes: null as number | null,
    scheduledMinutes: null as number | null,
    scheduledDowntimeMinutes: null as number | null,
    scheduledStopEpisodes: null as number | null,
    machineCount: population,
    coveredMachineCount,
    coverageComplete: false,
    reason,
    daily: [] as Day[],
  });

  const selected = machines ?? [];
  if (!machines) return unavailable("Filtros de setor e classificação não permitem atribuir toda a programação das máquinas.", 0, 0);
  if (!selected.length || effectiveEnd <= start) return unavailable("Sem máquinas elegíveis ou intervalo válido.", 0, selected.length);

  const byMachine = new Map<string, ScheduledProductionEvent[]>();
  for (const ev of events) {
    const list = byMachine.get(ev.machineId) ?? [];
    list.push(ev); byMachine.set(ev.machineId, list);
  }
  const stopByMachine = new Map<string, Interval[]>();
  for (const stop of failures) {
    if (stop.linkedCallIsSystemTest) continue;
    const list = stopByMachine.get(stop.machineId) ?? [];
    list.push({ start: stop.startedAt.getTime(), end: stop.endedAt?.getTime() ?? effectiveEnd.getTime() });
    stopByMachine.set(stop.machineId, list);
  }

  let covered = 0;
  let programmedMs = 0;
  let stoppedMs = 0;
  let stopEpisodes = 0;
  const daily = new Map<string, { scheduledMs: number; stoppedMs: number }>();
  const currentMs = effectiveEnd.getTime();

  // Intervals are split at local calendar-day boundaries. The next boundary is
  // found by minute-level binary search, so DST transitions don't assume 24h days.
  const allocate = (slice: Interval, kind: "scheduledMs" | "stoppedMs") => {
    let cursor = slice.start;
    while (cursor < slice.end) {
      const key = dateKey(new Date(cursor), timeZone);
      let low = cursor + 1;
      let high = slice.end;
      // Find the first millisecond of a new day if the end is on a later day.
      if (dateKey(new Date(slice.end - 1), timeZone) !== key) {
        while (low < high) {
          const middle = low + Math.floor((high - low) / 2);
          if (dateKey(new Date(middle), timeZone) === key) low = middle + 1;
          else high = middle;
        }
      }
      const next = dateKey(new Date(slice.end - 1), timeZone) === key ? slice.end : low;
      const day = daily.get(key) ?? { scheduledMs: 0, stoppedMs: 0 };
      day[kind] += next - cursor;
      daily.set(key, day);
      cursor = next;
    }
  };

  for (const machine of selected) {
    const first = Math.max(start.getTime(), machine.createdAt.getTime());
    if (first >= currentMs) continue;
    const records = (byMachine.get(machine.machineId) ?? [])
      .map(e => ({
        mode: productionMode(e.productionMode),
        start: Math.max(first, e.startedAt.getTime()),
        end: Math.min(currentMs, e.endedAt?.getTime() ?? currentMs),
      }))
      .filter(e => e.end > e.start)
      .sort((a,b) => a.start - b.start || a.end - b.end);

    if (!records.length || records[0].start !== first) {
      return unavailable("Histórico de programação incompleto para ao menos uma máquina.", covered, selected.length);
    }
    let edge = first;
    const planned: Interval[] = [];
    for (const entry of records) {
      if (!["scheduled","not_scheduled"].includes(entry.mode)) {
        return unavailable("Modo de produção não reconhecido no histórico.", covered, selected.length);
      }
      if (entry.start > edge) return unavailable("Existe uma lacuna no histórico de programação de produção.", covered, selected.length);
      if (entry.start < edge && entry.mode !== records[records.indexOf(entry) - 1]?.mode) {
        return unavailable("Existem períodos de programação conflitantes.", covered, selected.length);
      }
      if (entry.mode === "scheduled") planned.push({start:entry.start,end:entry.end});
      edge = Math.max(edge,entry.end);
    }
    if (edge < currentMs) return unavailable("Histórico de programação incompleto até a data consultada.", covered, selected.length);
    covered++;

    const scheduled = mergeIntervals(planned);
    const stopped = mergeIntervals(stopByMachine.get(machine.machineId) ?? []);
    for (const period of scheduled) {
      programmedMs += period.end - period.start;
      allocate(period,"scheduledMs");
    }
    for (const interval of stopped) {
      let episodeScheduled = false;
      for (const period of scheduled) {
        const overlap = intersection(interval,period);
        if (!overlap) continue;
        episodeScheduled = true;
        stoppedMs += overlap.end - overlap.start;
        allocate(overlap,"stoppedMs");
      }
      if (episodeScheduled) stopEpisodes++;
    }
  }

  const availableMs = Math.max(0,programmedMs-stoppedMs);
  const data = [...daily].sort(([a],[b]) => a.localeCompare(b)).map(([date,d])=>({
    date,
    scheduledMinutes: round2(d.scheduledMs/60_000),
    stoppedMinutes: round2(d.stoppedMs/60_000),
    availabilityPercent: d.scheduledMs > 0 ? round2(100*(d.scheduledMs-d.stoppedMs)/d.scheduledMs) : null,
  }));
  return {
    availabilityPercent: programmedMs > 0 ? round2(100*availableMs/programmedMs) : null,
    mtbfScheduledMinutes: stopEpisodes > 0 && availableMs > 0 ? round2(availableMs/stopEpisodes/60_000) : null,
    scheduledMinutes: round2(programmedMs/60_000),
    scheduledDowntimeMinutes: round2(stoppedMs/60_000),
    scheduledStopEpisodes: stopEpisodes,
    machineCount:selected.length,
    coveredMachineCount:covered,
    coverageComplete:true,
    reason: programmedMs === 0 ? "Nenhum período registrado como Produção Programada nesta janela." : null,
    daily:data,
  };
}
