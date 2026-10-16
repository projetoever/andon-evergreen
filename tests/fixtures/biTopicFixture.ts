import {
  buildExecutiveOverview,
  buildOverviewComparison,
} from "../../server/src/analytics/overview";
import { buildPlannedProductionKpis } from "../../server/src/analytics/productionKpis";
import type { AnalyticsOverview } from "../../src/types/analytics";

export function biTopicFixture(): AnalyticsOverview {
  const start = new Date("2026-10-09T03:00:00Z");
  const end = new Date("2026-10-16T03:00:00Z");
  const assets = [
    { machineId: "m9", exposureStartedAt: start },
    { machineId: "m37", exposureStartedAt: start },
  ];
  const failureEvents = [
    {
      id: "f1",
      machineId: "m9",
      machineName: "Máquina 9",
      startedAt: new Date("2026-10-10T10:00:00Z"),
      endedAt: new Date("2026-10-10T11:00:00Z"),
      classification: "sensor",
      failureResponsibility: "maintenance",
      callId: "c1",
      linkedCallIsSystemTest: false,
    },
    {
      id: "f2",
      machineId: "m37",
      machineName: "Qualidade",
      startedAt: new Date("2026-10-11T12:00:00Z"),
      endedAt: new Date("2026-10-11T12:30:00Z"),
      classification: "process",
      failureResponsibility: "process",
      callId: "c2",
      linkedCallIsSystemTest: false,
    },
  ];
  const calls = failureEvents.map((event, index) => ({
    id: `c${index + 1}`,
    machineId: event.machineId,
    subtype: "mechanical",
    status: "finished",
    openedAt: event.startedAt,
    attendedAt: new Date(event.startedAt.getTime() + 5 * 60_000),
    maintenanceCompletedAt: event.endedAt,
    finishedAt: event.endedAt,
    attendanceMinutes: index === 0 ? 55 : 25,
    postMaintenanceMinutes: 0,
    maintenanceReturnCount: index === 0 ? 1 : 0,
    failureClassification: event.classification,
    failureResponsibility: event.failureResponsibility,
    isSystemTest: false,
  }));
  const core = buildExecutiveOverview({
    calls,
    failureEvents,
    activeCallsNow: 0,
    reliabilityAssets: assets,
    start,
    end,
    effectiveEnd: end,
    generatedAt: end,
    timeZone: "America/Sao_Paulo",
    filters: {},
  });
  return {
    ...core,
    comparison: {
      period: { start: start.toISOString(), end: end.toISOString() },
      ...buildOverviewComparison(core, core),
    },
    highlights: { topMachine: null, topClassification: null, topSector: null },
    production: buildPlannedProductionKpis({
      assets,
      failureEvents,
      start,
      effectiveEnd: end,
      timeZone: "America/Sao_Paulo",
      productionEvents: assets.map((asset) => ({
        machineId: asset.machineId,
        productionMode: "scheduled",
        startedAt: start,
        endedAt: end,
      })),
    }),
  };
}
