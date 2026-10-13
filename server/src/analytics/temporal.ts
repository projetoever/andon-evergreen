import type { AnalyticsFailureEventRecord } from "./overview.js";

type TemporalCall = {
  id: string;
  openedAt: Date;
  isSystemTest: boolean;
};

export type TemporalInput = {
  calls: TemporalCall[];
  failureEvents: AnalyticsFailureEventRecord[];
  start: Date;
  effectiveEnd: Date;
  timeZone: string;
};

const HOUR_MS = 60 * 60 * 1000;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
type Interval = { from: number; to: number };
function round2(x: number) { return Math.round(x * 100) / 100; }

function localPosition(value: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(value);
  const weekdayToken = parts.find(p => p.type === "weekday")?.value ?? "";
  const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(weekdayToken);
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  if (weekday < 0 || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error("Não foi possível determinar dia e hora no fuso operacional");
  }
  return { weekday, hour };
}

function mergedPhysicalIntervals(events: AnalyticsFailureEventRecord[], start: number, end: number) {
  const byMachine = new Map<string, Interval[]>();
  for (const event of events) {
    if (event.linkedCallIsSystemTest) continue;
    const from = Math.max(start, event.startedAt.getTime());
    const to = Math.min(end, event.endedAt?.getTime() ?? end);
    if (to <= from) continue;
    const current = byMachine.get(event.machineId) ?? [];
    current.push({ from, to });
    byMachine.set(event.machineId, current);
  }

  const merged = new Map<string, Interval[]>();
  for (const [machine, intervals] of byMachine) {
    intervals.sort((a,b) => a.from - b.from || a.to - b.to);
    const result: Interval[] = [];
    for (const interval of intervals) {
      const last = result[result.length - 1];
      if (!last || interval.from > last.to) result.push({ ...interval });
      else last.to = Math.max(last.to, interval.to);
    }
    merged.set(machine, result);
  }
  return merged;
}

/**
 * Two distinct analytical domains:
 * - call heatmap: cohort by openedAt (not downtime or confirmed failure onset);
 * - physical heatmap: per-machine union of FailureEvents, sliced into local clock hours.
 *
 * Hour/day cells aggregate the selected rolling period, not 7 representative days.
 * Counts are not normalized for calendar exposure or production shifts.
 */
export function buildTemporalPatterns(input: TemporalInput) {
  const { calls, failureEvents, start, effectiveEnd, timeZone } = input;
  const from = start.getTime(), end = effectiveEnd.getTime();
  const callMatrix = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const downtimeMs = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23",
  });

  let callsCount = 0;
  for (const call of calls) {
    const opened = call.openedAt.getTime();
    if (call.isSystemTest || opened < from || opened >= end) continue;
    const { weekday, hour } = localPosition(call.openedAt, local);
    callMatrix[weekday][hour]++;
    callsCount++;
  }

  const intervals = mergedPhysicalIntervals(failureEvents, from, end);
  let physicalMs = 0;
  let physicalEpisodes = 0;
  for (const merged of intervals.values()) {
    physicalEpisodes += merged.length;
    for (const interval of merged) {
      physicalMs += interval.to - interval.from;
      let cursor = interval.from;
      while (cursor < interval.to) {
        const next = Math.min(interval.to, (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS);
        const { weekday, hour } = localPosition(new Date(cursor), local);
        downtimeMs[weekday][hour] += next - cursor;
        cursor = next;
      }
    }
  }

  const heatmap = WEEKDAYS.flatMap((day, weekday) =>
    Array.from({ length: 24 }, (_, hour) => ({
      weekday, day, hour,
      callsOpened: callMatrix[weekday][hour],
      downtimeMinutes: round2(downtimeMs[weekday][hour] / 60_000),
    })),
  );
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    callsOpened: callMatrix.reduce((n, a) => n + a[hour], 0),
    downtimeMinutes: round2(downtimeMs.reduce((n, a) => n + a[hour], 0) / 60_000),
  }));
  const byWeekday = WEEKDAYS.map((day, weekday) => ({
    weekday, day,
    callsOpened: callMatrix[weekday].reduce((n,x) => n + x, 0),
    downtimeMinutes: round2(downtimeMs[weekday].reduce((n,x) => n + x, 0) / 60_000),
  }));
  const peakCallHour = [...byHour].sort((a,b) => b.callsOpened - a.callsOpened || a.hour - b.hour)[0]!;
  const peakPhysicalHour = [...byHour].sort((a,b) => b.downtimeMinutes - a.downtimeMinutes || a.hour - b.hour)[0]!;

  return {
    totals: {
      callsOpened: callsCount,
      physicalDowntimeMinutes: round2(physicalMs / 60_000),
      physicalEpisodes,
      peakCallHour: peakCallHour.callsOpened > 0 ? peakCallHour.hour : null,
      peakPhysicalHour: peakPhysicalHour.downtimeMinutes > 0 ? peakPhysicalHour.hour : null,
    },
    heatmap, byHour, byWeekday,
    methodology: {
      calls: "Chamados agrupados pelo horário de abertura (openedAt), não pelo início físico da falha.",
      downtime: "Paradas físicas de FailureEvent agrupadas por minutos reais em cada hora local; intervalos sobrepostos da mesma máquina contam uma vez; máquinas diferentes somam.",
      filters: "Setor usa vínculo com chamado; eventos sem chamado não recebem setor presumido. Diagnóstico de chamada difere da classificação de FailureEvent.",
      exposure: "Distribuição bruta na janela móvel. Sem horários produtivos por turno, não representa taxa de falha nem risco relativo.",
    },
  };
}
