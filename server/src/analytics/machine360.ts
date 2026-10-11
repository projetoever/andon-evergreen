import { buildAssetReliability } from "./reliability.js";

export type Machine360Machine = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  machineStatus: string;
  productionMode: string;
};

export type Machine360Call = {
  id: string;
  machineId: string;
  subtype: string | null;
  status: string;
  openedAt: Date;
  attendedAt: Date | null;
  finishedAt: Date | null;
  attendanceMinutes: number | null;
  failureClassification: string | null;
  failureDescription: string | null;
  workOrderNumber: string | null;
  maintenanceReturnCount: number;
  technicianNames: string[];
  isSystemTest: boolean;
  machineSetNameSnapshot: string | null;
  machineSubsetNameSnapshot: string | null;
  confirmedMachineSetNameSnapshot: string | null;
  confirmedMachineSubsetNameSnapshot: string | null;
};

export type Machine360Failure = {
  id: string;
  machineId: string;
  startedAt: Date;
  endedAt: Date | null;
  classification: string | null;
  notes: string | null;
  callId: string | null;
  linkedCallIsSystemTest: boolean;
};

export type Machine360ActiveSession = { id: string; startedAt: Date };

export type Machine360Input = {
  machine: Machine360Machine;
  calls: Machine360Call[];
  activeCalls: Machine360Call[];
  events: Machine360Failure[];
  activeSessions: Machine360ActiveSession[];
  start: Date;
  effectiveEnd: Date;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const inWindow = (when: Date | null, start: Date, end: Date) =>
  when !== null && when.getTime() >= start.getTime() && when.getTime() < end.getTime();

function label(text: string | null) {
  return text?.trim() || null;
}
function snapshot(confirmed: string | null, opening: string | null) {
  return label(confirmed) ?? label(opening);
}

export function buildMachine360(input: Machine360Input) {
  const { machine, start, effectiveEnd } = input;
  const calls = input.calls.filter((c) => !c.isSystemTest && c.machineId === machine.id);
  const events = input.events.filter(
    (e) => !e.linkedCallIsSystemTest && e.machineId === machine.id,
  );
  const activeCalls = input.activeCalls.filter(
    (c) => !c.isSystemTest && c.machineId === machine.id,
  );
  const ended = calls.filter(
    (c) => c.status === "finished" && inWindow(c.finishedAt, start, effectiveEnd),
  );
  const opened = calls.filter((c) => inWindow(c.openedAt, start, effectiveEnd));
  const attended = calls.filter((c) => inWindow(c.attendedAt, start, effectiveEnd));

  const reliability = buildAssetReliability({
    machines: [{
      id: machine.id,
      name: machine.name,
      isActive: machine.isActive,
      createdAt: machine.createdAt,
    }],
    failureEvents: events.map((e) => ({
      id: e.id,
      machineId: e.machineId,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      classification: e.classification,
      callId: e.callId,
    })),
    calls: calls.map((c) => ({
      id: c.id,
      machineId: c.machineId,
      status: c.status,
      openedAt: c.openedAt,
      finishedAt: c.finishedAt,
      failureClassification: c.failureClassification,
      maintenanceReturnCount: c.maintenanceReturnCount,
    })),
    activeCalls: activeCalls.map((c) => ({
      id: c.id,
      machineId: c.machineId,
      status: c.status,
      openedAt: c.openedAt,
      finishedAt: c.finishedAt,
      failureClassification: c.failureClassification,
      maintenanceReturnCount: c.maintenanceReturnCount,
    })),
    activeSessions: input.activeSessions.map((s) => ({
      id: s.id,
      machineId: machine.id,
      startedAt: s.startedAt,
    })),
    start,
    effectiveEnd,
  }).assets[0];

  const diagnoses = new Map<string, number>();
  const assets = new Map<string, { setName: string | null; subsetName: string | null; calls: number }>();
  for (const call of ended) {
    const classification = label(call.failureClassification);
    if (classification) diagnoses.set(classification, (diagnoses.get(classification) ?? 0) + 1);
    const setName = snapshot(call.confirmedMachineSetNameSnapshot, call.machineSetNameSnapshot);
    const subsetName = snapshot(call.confirmedMachineSubsetNameSnapshot, call.machineSubsetNameSnapshot);
    const key = JSON.stringify([setName, subsetName]);
    const previous = assets.get(key) ?? { setName, subsetName, calls: 0 };
    previous.calls++;
    assets.set(key, previous);
  }

  const latest = [
    ...calls
      .filter((c) => inWindow(c.finishedAt, start, effectiveEnd) || inWindow(c.openedAt, start, effectiveEnd))
      .map((c) => ({
        kind: "call" as const,
        id: c.id,
        callId: c.id,
        occurredAt: (c.finishedAt && inWindow(c.finishedAt, start, effectiveEnd)
          ? c.finishedAt
          : c.openedAt).toISOString(),
        status: c.status,
        classification: c.failureClassification,
        description: label(c.failureDescription),
        workOrderNumber: c.workOrderNumber,
        technicianNames: c.technicianNames,
        setName: snapshot(c.confirmedMachineSetNameSnapshot, c.machineSetNameSnapshot),
        subsetName: snapshot(c.confirmedMachineSubsetNameSnapshot, c.machineSubsetNameSnapshot),
        durationMinutes: null as number | null,
      })),
    ...events
      .filter((e) => e.startedAt.getTime() < effectiveEnd.getTime() &&
        (e.endedAt === null || e.endedAt.getTime() > start.getTime()))
      .map((e) => ({
        kind: "failure_event" as const,
        id: e.id,
        callId: e.callId,
        occurredAt: e.startedAt.toISOString(),
        status: e.endedAt ? "closed" : "open",
        classification: e.classification,
        description: label(e.notes),
        workOrderNumber: null as string | null,
        technicianNames: [] as string[],
        setName: null as string | null,
        subsetName: null as string | null,
        durationMinutes: round2(
          Math.max(
            0,
            Math.min(e.endedAt?.getTime() ?? effectiveEnd.getTime(), effectiveEnd.getTime()) -
              Math.max(e.startedAt.getTime(), start.getTime()),
          ) / 60_000,
        ),
      })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));

  const mean = (values: number[]) => values.length
    ? round2(values.reduce((sum, n) => sum + n, 0) / values.length)
    : null;

  const openAges = activeCalls.map(c => Math.max(0, round2(
    (effectiveEnd.getTime() - c.openedAt.getTime()) / 60_000,
  )));
  const openFailureAges = events.filter(e => !e.endedAt).map(e => Math.max(0, round2(
    (effectiveEnd.getTime() - e.startedAt.getTime()) / 60_000,
  )));

  return {
    machine: {
      id: machine.id,
      name: machine.name,
      isActive: machine.isActive,
      machineStatus: machine.machineStatus,
      productionMode: machine.productionMode,
    },
    kpis: {
      callsOpened: opened.length,
      callsFinished: ended.length,
      callsActiveNow: activeCalls.length,
      activeSessionsNow: input.activeSessions.length,
      mttaMinutes: mean(attended.filter(c => c.attendedAt).map(c =>
        (c.attendedAt!.getTime() - c.openedAt.getTime()) / 60_000,
      )),
      avgMaintenanceMinutes: mean(ended
        .map(c => c.attendanceMinutes)
        .filter((v): v is number => v !== null && v >= 0)),
      downtimeMinutes: reliability.downtimeMinutes,
      physicalStopEpisodes: reliability.physicalStopEpisodes,
      avgDowntimePerEpisodeMinutes: reliability.avgDowntimePerEpisodeMinutes,
      mtbfEstimatedMinutes: reliability.mtbfEstimatedMinutes,
      maintenanceReturnCycles: ended.reduce((sum, c) => sum + Math.max(0, c.maintenanceReturnCount), 0),
    },
    diagnoses: Array.from(diagnoses, ([classification, count]) => ({ classification, count }))
      .sort((a, b) => b.count - a.count || a.classification.localeCompare(b.classification)),
    assets: Array.from(assets.values()).sort((a, b) => b.calls - a.calls),
    dataHealth: {
      oldestActiveCallMinutes: openAges.length ? Math.max(...openAges) : null,
      openFailureEvents: openFailureAges.length,
      oldestOpenFailureMinutes: openFailureAges.length ? Math.max(...openFailureAges) : null,
      activeSessionsNow: input.activeSessions.length,
      finishedWithoutClassification: ended.filter(c => !label(c.failureClassification)).length,
      standaloneFailureEvents: events.filter(e => !e.callId).length,
    },
    timeline: {
      total: latest.length,
      items: latest.slice(0, 40),
      truncated: latest.length > 40,
    },
  };
}
