const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
} as const;

export type FailureIntelligenceCall = {
  id: string;
  machineId: string;
  machineName: string;
  subtype: string | null;
  openedAt: Date;
  finishedAt: Date;
  classification: string | null;
  description: string | null;
  workOrderNumber: string | null;
  maintenanceReturnCount: number;
  isSystemTest: boolean;
  confirmedMachineSetId: string | null;
  confirmedMachineSetNameSnapshot: string | null;
  confirmedMachineSubsetId: string | null;
  confirmedMachineSubsetNameSnapshot: string | null;
  machineSetId: string | null;
  machineSetNameSnapshot: string | null;
  machineSubsetId: string | null;
  machineSubsetNameSnapshot: string | null;
};

export type FailureIntelligenceFilters = {
  machineId?: string;
  subtype?: string;
  classification?: string;
};

type FailureIntelligenceParams = {
  calls: FailureIntelligenceCall[];
  start: Date;
  effectiveEnd: Date;
  filters: FailureIntelligenceFilters;
};

function validLabel(value: string | null) {
  return value?.trim() || null;
}

function chosenAsset(
  confirmedId: string | null,
  confirmedName: string | null,
  openingId: string | null,
  openingName: string | null,
) {
  if (confirmedId || validLabel(confirmedName)) {
    return { id: confirmedId, name: validLabel(confirmedName) };
  }
  return { id: openingId, name: validLabel(openingName) };
}

function cohortMatch(call: FailureIntelligenceCall, filters: FailureIntelligenceFilters) {
  return (
    (!filters.machineId || call.machineId === filters.machineId) &&
    (!filters.subtype || call.subtype === filters.subtype) &&
    (!filters.classification || validLabel(call.classification) === filters.classification)
  );
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Diagnóstico repetido em chamado FINALIZADO, não "causa raiz" nem parada física.
 * A coorte usa finishedAt em [start, effectiveEnd). O antecedente pode estar
 * até 30 dias ANTES do começo da coorte, independentemente do setor histórico.
 */
export function buildFailureIntelligence({
  calls,
  start,
  effectiveEnd,
  filters,
}: FailureIntelligenceParams) {
  const startMs = start.getTime();
  const endMs = effectiveEnd.getTime();
  const historyStartMs = startMs - WINDOWS["30d"];
  const history = calls
    .filter(
      (call) =>
        !call.isSystemTest &&
        call.finishedAt.getTime() >= historyStartMs &&
        call.finishedAt.getTime() < endMs &&
        Boolean(validLabel(call.classification)),
    )
    .sort(
      (a, b) =>
        a.finishedAt.getTime() - b.finishedAt.getTime() ||
        a.id.localeCompare(b.id),
    );

  const lastByDiagnosis = new Map<string, FailureIntelligenceCall>();
  const recurrenceCount = { "24h": 0, "7d": 0, "30d": 0 };
  let eligibleCalls = 0;
  let returnsInCohort = 0;
  const grouped = new Map<
    string,
    {
      machineId: string;
      machineName: string;
      classification: string;
      calls: number;
      repeats24h: number;
      repeats7d: number;
      repeats30d: number;
      returnCycles: number;
      totalGapHours: number;
      gapSamples: number;
      cases: Array<{
        callId: string;
        finishedAt: string;
        machineName: string;
        classification: string;
        subtype: string | null;
        setName: string | null;
        subsetName: string | null;
        description: string | null;
        workOrderNumber: string | null;
        returnCycles: number;
        gapSincePreviousHours: number | null;
        repeat24h: boolean;
        repeat7d: boolean;
        repeat30d: boolean;
      }>;
      assets: Map<string, { setName: string | null; subsetName: string | null; count: number }>;
    }
  >();

  for (const call of history) {
    const diagnosis = validLabel(call.classification);
    if (!diagnosis) continue;
    const key = JSON.stringify([call.machineId, diagnosis]);
    const previous = lastByDiagnosis.get(key);
    const gapMs =
      previous && previous.id !== call.id
        ? call.finishedAt.getTime() - previous.finishedAt.getTime()
        : null;
    const gapInWindow = gapMs !== null && gapMs > 0 && gapMs <= WINDOWS["30d"];

    if (
      call.finishedAt.getTime() >= startMs &&
      call.finishedAt.getTime() < endMs &&
      cohortMatch(call, filters)
    ) {
      eligibleCalls += 1;
      returnsInCohort += Math.max(0, call.maintenanceReturnCount);
      const repeat24h = gapInWindow && gapMs! <= WINDOWS["24h"];
      const repeat7d = gapInWindow && gapMs! <= WINDOWS["7d"];
      const repeat30d = gapInWindow;

      if (repeat24h) recurrenceCount["24h"]++;
      if (repeat7d) recurrenceCount["7d"]++;
      if (repeat30d) recurrenceCount["30d"]++;

      const group = grouped.get(key) ?? {
        machineId: call.machineId,
        machineName: call.machineName,
        classification: diagnosis,
        calls: 0,
        repeats24h: 0,
        repeats7d: 0,
        repeats30d: 0,
        returnCycles: 0,
        totalGapHours: 0,
        gapSamples: 0,
        cases: [],
        assets: new Map<string, { setName: string | null; subsetName: string | null; count: number }>(),
      };
      group.calls++;
      if (repeat24h) group.repeats24h++;
      if (repeat7d) group.repeats7d++;
      if (repeat30d) {
        group.repeats30d++;
        group.gapSamples++;
        group.totalGapHours += gapMs! / 3_600_000;
      }
      const returnCycles = Math.max(0, call.maintenanceReturnCount);
      group.returnCycles += returnCycles;

      const set = chosenAsset(
        call.confirmedMachineSetId,
        call.confirmedMachineSetNameSnapshot,
        call.machineSetId,
        call.machineSetNameSnapshot,
      );
      const subset = chosenAsset(
        call.confirmedMachineSubsetId,
        call.confirmedMachineSubsetNameSnapshot,
        call.machineSubsetId,
        call.machineSubsetNameSnapshot,
      );
      const assetKey = JSON.stringify([set.id ?? set.name, subset.id ?? subset.name]);
      const asset = group.assets.get(assetKey) ?? {
        setName: set.name,
        subsetName: subset.name,
        count: 0,
      };
      asset.count++;
      group.assets.set(assetKey, asset);

      group.cases.push({
        callId: call.id,
        finishedAt: call.finishedAt.toISOString(),
        machineName: call.machineName,
        classification: diagnosis,
        subtype: call.subtype,
        setName: set.name,
        subsetName: subset.name,
        description: validLabel(call.description),
        workOrderNumber: validLabel(call.workOrderNumber),
        returnCycles,
        gapSincePreviousHours: gapInWindow ? round2(gapMs! / 3_600_000) : null,
        repeat24h,
        repeat7d,
        repeat30d,
      });
      grouped.set(key, group);
    }

    // Equal-timestamp calls cannot be ordered as successive interventions.
    // Keep the first one as the previous reference for that instant.
    if (!previous || call.finishedAt.getTime() > previous.finishedAt.getTime()) {
      lastByDiagnosis.set(key, call);
    }
  }

  const groups = Array.from(grouped.values())
    .map((group) => ({
      machineId: group.machineId,
      machineName: group.machineName,
      classification: group.classification,
      calls: group.calls,
      repeats24h: group.repeats24h,
      repeats7d: group.repeats7d,
      repeats30d: group.repeats30d,
      returnCycles: group.returnCycles,
      averageRepeatGapHours:
        group.gapSamples > 0 ? round2(group.totalGapHours / group.gapSamples) : null,
      assetBreakdown: Array.from(group.assets.values())
        .sort((a, b) => b.count - a.count),
      totalCases: group.cases.length,
      cases: group.cases.slice(-30).reverse(),
    }))
    .sort(
      (a, b) =>
        b.repeats30d - a.repeats30d ||
        b.calls - a.calls ||
        a.machineName.localeCompare(b.machineName, "pt-BR", { numeric: true }),
    );

  const withAsset = groups.reduce(
    (sum, group) =>
      sum +
      group.assetBreakdown.reduce(
        (total, asset) => total + (asset.setName ? asset.count : 0),
        0,
      ),
    0,
  );

  return {
    totals: {
      diagnosedFinishedCalls: eligibleCalls,
      repeated24h: recurrenceCount["24h"],
      repeated7d: recurrenceCount["7d"],
      repeated30d: recurrenceCount["30d"],
      repeatRate30dPercent:
        eligibleCalls > 0 ? round2((recurrenceCount["30d"] / eligibleCalls) * 100) : null,
      maintenanceReturnCycles: returnsInCohort,
      locatedSetCount: withAsset,
    },
    groups,
    coverage: {
      includedHistoryCalls: history.length,
      diagnosedFinishedCalls: eligibleCalls,
      withSetSnapshot: withAsset,
      withSetSnapshotPercent:
        eligibleCalls > 0 ? round2((withAsset / eligibleCalls) * 100) : null,
      groupCaseCap: 30,
    },
  };
}
