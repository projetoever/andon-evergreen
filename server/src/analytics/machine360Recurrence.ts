const DAY = 24 * 60 * 60 * 1000;

export type MachineRecurrenceCall = {
  id: string;
  subtype: string | null;
  finishedAt: Date;
  classification: string | null;
  workOrderNumber: string | null;
  description: string | null;
  maintenanceReturnCount: number;
  isSystemTest: boolean;
  machineSetId: string | null;
  machineSetNameSnapshot: string | null;
  machineSubsetId: string | null;
  machineSubsetNameSnapshot: string | null;
  confirmedMachineSetId: string | null;
  confirmedMachineSetNameSnapshot: string | null;
  confirmedMachineSubsetId: string | null;
  confirmedMachineSubsetNameSnapshot: string | null;
};

type Parameters = {
  calls: MachineRecurrenceCall[];
  start: Date;
  effectiveEnd: Date;
  subtype?: string;
  classification?: string;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
function cleaned(v: string | null) {
  return v?.trim() || null;
}
function location(
  confirmedId: string | null,
  confirmedName: string | null,
  openingId: string | null,
  openingName: string | null,
) {
  if (confirmedId || cleaned(confirmedName)) {
    return { id: confirmedId, name: cleaned(confirmedName) };
  }
  return { id: openingId, name: cleaned(openingName) };
}

function locationKey(id: string | null, name: string | null): string | null {
  return id ? `id:${id}` : name ? `name:${name.toLocaleLowerCase("pt-BR")}` : null;
}
type Occurrence = {
  callId: string;
  finishedAt: string;
  classification: string;
  setName: string | null;
  subsetName: string | null;
  workOrderNumber: string | null;
  description: string | null;
  returnCycles: number;
  previousDiagnosisHours: number | null;
  previousSetHours: number | null;
  previousSubsetHours: number | null;
  repeat24h: boolean;
  repeat7d: boolean;
  repeat30d: boolean;
  repeatSet30d: boolean;
  repeatSubset30d: boolean;
};
type Breakdown = {
  setName: string | null;
  subsetName: string | null;
  classification: string;
  calls: number;
  repeats30d: number;
  lastFinishedAt: string;
};

/**
 * Historical diagnostic recurrence, NOT root cause or physical stop count.
 * Comparisons look back 30 days before the cohort start and use finalized calls.
 * Unknown asset locations never count as confirmed location-level repeats.
 */
export function buildMachine360Recurrence({
  calls, start, effectiveEnd, subtype, classification,
}: Parameters) {
  const startMs = start.getTime();
  const endMs = effectiveEnd.getTime();
  const lookbackMs = startMs - 30 * DAY;
  const eligible = calls
    .filter((c) =>
      !c.isSystemTest &&
      c.finishedAt.getTime() >= lookbackMs &&
      c.finishedAt.getTime() < endMs &&
      Boolean(cleaned(c.classification)),
    )
    .sort((a, b) =>
      a.finishedAt.getTime() - b.finishedAt.getTime() || a.id.localeCompare(b.id),
    );
  const lastDiagnosis = new Map<string, MachineRecurrenceCall>();
  const lastSet = new Map<string, MachineRecurrenceCall>();
  const lastSubset = new Map<string, MachineRecurrenceCall>();
  const groups = new Map<string, Breakdown>();
  const cases: Occurrence[] = [];
  let diagnosed = 0;
  let withSet = 0;
  let withSubset = 0;
  let repeated24h = 0;
  let repeated7d = 0;
  let repeated30d = 0;
  let repeatedSet30d = 0;
  let repeatedSubset30d = 0;
  let returnCycles = 0;
  const gap = (previous: MachineRecurrenceCall | undefined, current: MachineRecurrenceCall) => {
    if (!previous || previous.id === current.id) return null;
    const millis = current.finishedAt.getTime() - previous.finishedAt.getTime();
    return millis > 0 && millis <= 30 * DAY ? millis : null;
  };

  for (const c of eligible) {
    const diagnosis = cleaned(c.classification)!;
    const set = location(c.confirmedMachineSetId, c.confirmedMachineSetNameSnapshot,
      c.machineSetId, c.machineSetNameSnapshot);
    const subset = location(c.confirmedMachineSubsetId, c.confirmedMachineSubsetNameSnapshot,
      c.machineSubsetId, c.machineSubsetNameSnapshot);
    const setIdentity = locationKey(set.id, set.name);
    const subsetIdentity = locationKey(subset.id, subset.name);
    const diagnosisKey = diagnosis;
    const setKey = setIdentity ? JSON.stringify([diagnosis, setIdentity]) : null;
    const subsetKey = setIdentity && subsetIdentity
      ? JSON.stringify([diagnosis, setIdentity, subsetIdentity]) : null;
    const diagnosisGap = gap(lastDiagnosis.get(diagnosisKey), c);
    const setGap = setKey ? gap(lastSet.get(setKey), c) : null;
    const subsetGap = subsetKey ? gap(lastSubset.get(subsetKey), c) : null;
    const within = c.finishedAt.getTime() >= startMs && c.finishedAt.getTime() < endMs;
    const accepted = within &&
      (!subtype || c.subtype === subtype) &&
      (!classification || diagnosis === classification);

    if (accepted) {
      diagnosed++;
      if (setIdentity) withSet++;
      if (subsetKey) withSubset++;
      const d24 = diagnosisGap !== null && diagnosisGap <= DAY;
      const d7 = diagnosisGap !== null && diagnosisGap <= 7 * DAY;
      const d30 = diagnosisGap !== null;
      const s30 = setGap !== null;
      const sub30 = subsetGap !== null;
      repeated24h += Number(d24);
      repeated7d += Number(d7);
      repeated30d += Number(d30);
      repeatedSet30d += Number(s30);
      repeatedSubset30d += Number(sub30);
      returnCycles += Math.max(0, c.maintenanceReturnCount);
      const groupKey = JSON.stringify([setIdentity, subsetIdentity, diagnosis]);
      const group = groups.get(groupKey) ?? {
        setName: set.name,
        subsetName: subset.name,
        classification: diagnosis,
        calls: 0,
        repeats30d: 0,
        lastFinishedAt: c.finishedAt.toISOString(),
      };
      group.calls++;
      group.repeats30d += Number(sub30);
      group.lastFinishedAt = c.finishedAt.toISOString();
      groups.set(groupKey, group);
      cases.push({
        callId: c.id,
        finishedAt: c.finishedAt.toISOString(),
        classification: diagnosis,
        setName: set.name,
        subsetName: subset.name,
        workOrderNumber: c.workOrderNumber,
        description: cleaned(c.description),
        returnCycles: c.maintenanceReturnCount,
        previousDiagnosisHours: diagnosisGap === null ? null : round2(diagnosisGap / 3_600_000),
        previousSetHours: setGap === null ? null : round2(setGap / 3_600_000),
        previousSubsetHours: subsetGap === null ? null : round2(subsetGap / 3_600_000),
        repeat24h: d24,
        repeat7d: d7,
        repeat30d: d30,
        repeatSet30d: s30,
        repeatSubset30d: sub30,
      });
    }

    // An identical timestamp cannot establish which work order occurred first.
    if (!lastDiagnosis.has(diagnosisKey) ||
      c.finishedAt > lastDiagnosis.get(diagnosisKey)!.finishedAt) lastDiagnosis.set(diagnosisKey, c);
    if (setKey && (!lastSet.has(setKey) || c.finishedAt > lastSet.get(setKey)!.finishedAt)) lastSet.set(setKey, c);
    if (subsetKey && (!lastSubset.has(subsetKey) || c.finishedAt > lastSubset.get(subsetKey)!.finishedAt)) lastSubset.set(subsetKey, c);
  }

  return {
    totals: {
      diagnosedFinishedCalls: diagnosed,
      repeated24h, repeated7d, repeated30d,
      repeatedSet30d, repeatedSubset30d, maintenanceReturnCycles: returnCycles,
      withSetSnapshot: withSet, withSubsetSnapshot: withSubset,
    },
    groups: [...groups.values()].sort((a, b) =>
      b.repeats30d - a.repeats30d ||
      b.calls - a.calls ||
      b.lastFinishedAt.localeCompare(a.lastFinishedAt),
    ).slice(0, 40),
    groupsTruncated: groups.size > 40,
    timeline: cases.reverse().slice(0, 80),
    totalTimelineCases: cases.length,
    timelineTruncated: cases.length > 80,
    semantics: {
      diagnostic: "Mesmo diagnóstico registrado em outro chamado finalizado na máquina; não é causa raiz comprovada.",
      hierarchy: "Repetição de conjunto exige diagnóstico e conjunto iguais; de subconjunto exige diagnóstico, conjunto e subconjunto iguais com identificação histórica.",
      lookback: "Histórico até 30 dias anterior ao início da janela; janelas de 24h/7d/30d cumulativas.",
      counts: "Retornos dentro de um chamado não são reincidência entre chamados; dados sem localização não entram na recorrência por conjunto.",
    },
  };
}
