import { PrismaClient } from "@prisma/client";
import { analyticsEligibility, METRIC_VERSION } from "../dist/analytics/eligibility.js";
import { buildCausalEpisodes, summarizeCausalDowntime } from "../dist/analytics/causality.js";
import { buildExecutiveOverview } from "../dist/analytics/overview.js";
import { buildPlannedProductionKpis } from "../dist/analytics/productionKpis.js";

/**
 * S6: read-only, reproducible BI calculations using the actual production
 * analytics functions on a FROZEN window. Run twice, before pg_dump and after
 * restore into an isolated clone. No user/machine data or secret is printed.
 *
 * This is a parity proof, NOT a claim that production schedule/GPIO is correct.
 */
const databaseUrl = process.env.DATABASE_URL ?? "";
const startIso = process.env.ANDON_HML_BI_PERIOD_START ?? "";
const endIso = process.env.ANDON_HML_BI_PERIOD_END ?? "";
const allowed = process.env.ANDON_HML_BI_COMPARE === "1";
let endpoint;
try { endpoint = new URL(databaseUrl); } catch { endpoint = null; }
const database = endpoint?.pathname.replace(/^\//, "");
const notebookDatabase = database === "andon_https_hml" || /^andon_hml_restore_[0-9a-f]{12}$/.test(database ?? "");
const ciDatabase = database === "andon_test" && process.env.ANDON_INTEGRATION_TEST === "1" && process.env.NODE_ENV === "test";
const start = new Date(startIso), end = new Date(endIso);
if (!allowed || !endpoint || !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
    (!notebookDatabase && !ciDatabase) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(startIso) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(endIso) ||
    !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
    start >= end || end.getTime() - start.getTime() > 31 * 86400000 ||
    (notebookDatabase && (endpoint.username !== "andon_hml" || endpoint.port === "" || Number(endpoint.port) === 5432))) {
  throw new Error("S6 BI snapshot requires explicit isolated localhost database and fixed <=31-day UTC window");
}
const db = new PrismaClient();
try {
  const catalog = await db.failureClassification.findMany({
    select: { value: true, analyticsDisposition: true },
  });
  const policy = analyticsEligibility(catalog);
  const callScope = {
    OR: [
      { openedAt: { gte: start, lt: end } },
      { attendedAt: { gte: start, lt: end } },
      { finishedAt: { gte: start, lt: end } },
    ],
  };
  const [calls, events, machines, scopedCalls, activeCallsNow] = await Promise.all([
    db.andonCall.findMany({
      where: { ...policy.callWhere, ...callScope },
      select: {
        id: true, machineId: true, subtype: true, status: true,
        openedAt: true, attendedAt: true, maintenanceCompletedAt: true,
        finishedAt: true, attendanceMinutes: true, postMaintenanceMinutes: true,
        maintenanceReturnCount: true, failureClassification: true,
        failureResponsibility: true, analyticsDisposition: true, isSystemTest: true,
      },
    }),
    db.failureEvent.findMany({
      where: { ...policy.eventWhere, startedAt: { lt: end } },
      select: {
        id: true, machineId: true, startedAt: true, endedAt: true,
        classification: true, failureResponsibility: true,
        analyticsDisposition: true, callId: true,
        machine: { select: { name: true } },
        call: { select: { isSystemTest: true } },
      },
    }),
    db.machine.findMany({
      where: { isActive: true, createdAt: { lt: end } },
      select: { id: true, createdAt: true },
    }),
    db.andonCall.count({ where: callScope }),
    db.andonCall.count({
      where: { ...policy.callWhere, status: { in: ["open", "in_progress", "post_maintenance"] } },
    }),
  ]);
  const failureEvents = events.map((row) => ({
    id: row.id,
    machineId: row.machineId,
    machineName: row.machine.name,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    classification: row.classification,
    failureResponsibility: row.failureResponsibility,
    analyticsDisposition: row.analyticsDisposition,
    callId: row.callId,
    linkedCallIsSystemTest: row.call?.isSystemTest === true,
  }));
  const [impacts, productionEvents] = await Promise.all([
    failureEvents.length ? db.callImpactInterval.findMany({
      where: {
        machineId: { in: [...new Set(failureEvents.map((e) => e.machineId))] },
        startedAt: { lt: end },
        call: policy.callWhere,
      },
      select: {
        id: true, machineId: true, startedAt: true, endedAt: true,
        call: { select: { failureResponsibility: true } },
      },
    }) : Promise.resolve([]),
    machines.length ? db.machineProductionEvent.findMany({
      where: {
        machineId: { in: machines.map((m) => m.id) },
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: { machineId: true, productionMode: true, startedAt: true, endedAt: true },
    }) : Promise.resolve([]),
  ]);
  const causalEpisodes = buildCausalEpisodes(failureEvents, impacts.map((row) => ({
    id: row.id, machineId: row.machineId, startedAt: row.startedAt,
    endedAt: row.endedAt, failureResponsibility: row.call.failureResponsibility,
  })));
  const assets = machines.map((m) => ({
    machineId: m.id, exposureStartedAt: m.createdAt,
  }));
  const overview = buildExecutiveOverview({
    calls, failureEvents, causalEpisodes, reliabilityAssets: assets,
    activeCallsNow, start, end, effectiveEnd: end, generatedAt: end,
    timeZone: "America/Sao_Paulo", filters: {},
  });
  const production = buildPlannedProductionKpis({
    assets, productionEvents, failureEvents, causalEpisodes,
    start, effectiveEnd: end, timeZone: "America/Sao_Paulo",
  });
  const downtimeByCause = summarizeCausalDowntime(causalEpisodes, start, end);
  const metrics = {
    schema: "refine5-s6-bi-parity-v1",
    metricDefinitionVersion: METRIC_VERSION,
    period: { start: start.toISOString(), end: end.toISOString() },
    kpis: overview.kpis,
    coverage: overview.coverage,
    trend: overview.trend,
    downtimeTrend: overview.downtimeTrend,
    production: {
      availabilityPercent: production.availabilityPercent,
      plannedMtbfMinutes: production.plannedMtbfMinutes,
      scheduledMinutes: production.scheduledMinutes,
      scheduledDowntimeMinutes: production.scheduledDowntimeMinutes,
      operatingMinutes: production.operatingMinutes,
      resolvedMttrMinutes: production.resolvedMttrMinutes,
      resolvedEpisodes: production.resolvedEpisodes,
      mttrAvailabilityReason: production.mttrAvailabilityReason,
      mtbfAvailabilityReason: production.mtbfAvailabilityReason,
      coveredMachineCount: production.coveredMachineCount,
      uncoveredMachineCount: production.uncoveredMachineCount,
      pendingAttributionEpisodes: production.pendingAttributionEpisodes,
      daily: production.daily,
    },
    excludedCallCount: scopedCalls - calls.length,
    responsibilityDowntime: downtimeByCause,
    // Empty cohorts are valid parity, but not BI functional approval.
    hasData: scopedCalls > 0 || failureEvents.length > 0 || productionEvents.length > 0,
  };
  process.stdout.write(JSON.stringify(metrics) + "\n");
} catch {
  // A database exception must not leak credentials, call text or SQL fragments.
  throw new Error("isolated BI parity snapshot failed");
} finally {
  await db.$disconnect();
}
