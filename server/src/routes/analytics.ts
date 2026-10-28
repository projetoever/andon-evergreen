import { loadAnalyticsEligibility } from "../analytics/datasetPolicy.js";
import { buildCausalEpisodes, summarizeCausalDowntime } from "../analytics/causality.js";
import { METRIC_VERSION, GENERIC_DIAGNOSES } from "../analytics/eligibility.js";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { buildFailureIntelligence } from "../analytics/failureIntelligence.js";
import { buildMachine360 } from "../analytics/machine360.js";
import { buildMachine360Recurrence } from "../analytics/machine360Recurrence.js";
import { buildMaintenanceParticipation } from "../analytics/maintenance.js";
import { buildAssetReliability } from "../analytics/reliability.js";
import { buildPlannedProductionKpis } from "../analytics/productionKpis.js";
import { buildTemporalPatterns } from "../analytics/temporal.js";
import {
  buildExecutiveHighlights,
  buildExecutiveOverview,
  buildOverviewComparison,
  parseAnalyticsInstant,
  type AnalyticsFailureEventRecord,
  type AnalyticsOverviewFilters,
  type AnalyticsReliabilityAsset,
} from "../analytics/overview.js";
import { prisma } from "../db/prisma.js";
import { AccessError } from "../access/policy.js";
import { badRequest } from "./routeUtils.js";
import { registerAnalyticsDataQualityRoutes } from "./analyticsDataQuality.js";
import { scopedMachineReadIds } from "../security/centralScopedMachineReads.js";

type AnalyticsOverviewQuery = {
  startDate?: string;
  endDate?: string;
  machineId?: string;
  subtype?: string;
  classification?: string;
  includeInactive?: string;
};

type AnalyticsDrilldownQuery = AnalyticsOverviewQuery & {
  dimension?: string;
  value?: string;
  limit?: string;
};

const ACTIVE_CALL_STATUSES = ["open", "in_progress", "post_maintenance"];
const DRILLDOWN_DIMENSIONS = new Set(["machine", "classification", "sector"]);
const DEFAULT_OPERATIONAL_TIME_ZONE =
  process.env.ANDON_TIME_ZONE?.trim() || "America/Sao_Paulo";

function optionalQueryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseAnalyticsPeriod(query: AnalyticsOverviewQuery) {
  const start = parseAnalyticsInstant(query.startDate);
  const end = parseAnalyticsInstant(query.endDate);

  if (!start || !end || start.getTime() >= end.getTime()) return null;
  return { start, end };
}

function parseDrilldownLimit(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 50) : 20;
}

function callDimensionsWhere(filters: AnalyticsOverviewFilters): Prisma.AndonCallWhereInput {
  return {
    ...(filters.machineId ? { machineId: filters.machineId } : {}),
    ...(filters.subtype ? { subtype: filters.subtype } : {}),
    ...(filters.classification
      ? { failureClassification: filters.classification }
      : {}),
  };
}

const analyticsEventSelect = {
  id: true,
  machineId: true,
  startedAt: true,
  endedAt: true,
  classification: true,
  failureResponsibility: true,
  analyticsDisposition: true,
  callId: true,
  machine: {
    select: {
      name: true,
    },
  },
  call: {
    select: {
      isSystemTest: true,
      subtype: true,
    },
  },
} satisfies Prisma.FailureEventSelect;

async function loadOverviewDataset(
  start: Date,
  end: Date,
  effectiveEnd: Date,
  filters: AnalyticsOverviewFilters,
  includeActiveCalls: boolean,
) {
  const policy = await loadAnalyticsEligibility();
  const dimensionsWhere = callDimensionsWhere(filters);
  const reliabilityEnabled = !filters.subtype && !filters.classification;

  const [calls, activeCallsNow, rawReliabilityAssets] = await Promise.all([
    prisma.andonCall.findMany({
      where: {
        ...policy.callWhere,
        ...dimensionsWhere,
        OR: [
          { openedAt: { gte: start, lt: effectiveEnd } },
          { attendedAt: { gte: start, lt: effectiveEnd } },
          { finishedAt: { gte: start, lt: effectiveEnd } },
        ],
      },
      select: {
        id: true,
        machineId: true,
        subtype: true,
        status: true,
        openedAt: true,
        attendedAt: true,
        maintenanceCompletedAt: true,
        finishedAt: true,
        attendanceMinutes: true,
        postMaintenanceMinutes: true,
        maintenanceReturnCount: true,
        failureClassification: true,
        failureResponsibility: true, analyticsDisposition: true,
        isSystemTest: true,
      },
    }),
    includeActiveCalls && !filters.classification
      ? prisma.andonCall.count({
          where: {
            ...policy.callWhere,
            status: { in: ACTIVE_CALL_STATUSES },
            ...(filters.machineId ? { machineId: filters.machineId } : {}),
            ...(filters.subtype ? { subtype: filters.subtype } : {}),
          },
        })
      : Promise.resolve(null),
    reliabilityEnabled
      ? prisma.machine.findMany({
          where: {
            ...(filters.machineId ? { id: filters.machineId } : { isActive: true }),
            createdAt: { lt: effectiveEnd },
          },
          select: {
            id: true,
            createdAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const reliabilityAssets: AnalyticsReliabilityAsset[] | null = rawReliabilityAssets
    ? rawReliabilityAssets.map((machine) => ({
        machineId: machine.id,
        exposureStartedAt: machine.createdAt,
      }))
    : null;

  let failureEvents: AnalyticsFailureEventRecord[] = [];

  if (effectiveEnd.getTime() > start.getTime()) {
    let rawFailureEvents = await prisma.failureEvent.findMany({
      where: {
        ...policy.eventWhere,
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.classification
          ? { classification: filters.classification }
          : {}),
        startedAt: { lt: effectiveEnd },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: analyticsEventSelect,
    });

    // Restore the complete union episode when legacy overlapping records
    // connect to an interval that began before the report window.
    for (let round=0; rawFailureEvents.length; round++) {
      const earliest = new Map<string, Date>();
      for (const event of rawFailureEvents) {
        const previous = earliest.get(event.machineId);
        if (!previous || event.startedAt < previous) earliest.set(event.machineId,event.startedAt);
      }
      const earlier = await prisma.failureEvent.findMany({
        where: {
          ...policy.eventWhere,
          ...(filters.classification ? { classification:filters.classification } : {}),
          ...(filters.subtype ? { call:{is:{subtype:filters.subtype}} } : {}),
          OR:[...earliest].map(([machineId,boundary]) => ({machineId,startedAt:{lt:boundary},OR:[{endedAt:null},{endedAt:{gte:boundary}}]})),
        },
        select: analyticsEventSelect,
      });
      if (!earlier.length) break;
      if (round>=127) throw new Error("Histórico físico excessivamente fragmentado; revise os eventos antes de calcular o MTTR.");
      rawFailureEvents = [...new Map([...rawFailureEvents,...earlier].map(row => [row.id,row])).values()];
    }

    failureEvents = rawFailureEvents
      .filter((event) => event.call?.isSystemTest !== true)
      .filter(
        (event) =>
          !filters.subtype ||
          (event.call !== null && event.call.subtype === filters.subtype),
      )
      .map((event) => ({
        id: event.id,
        machineId: event.machineId,
        machineName: event.machine.name,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        classification: event.classification,
        failureResponsibility: event.failureResponsibility, analyticsDisposition: event.analyticsDisposition,
        callId: event.callId,
        linkedCallIsSystemTest: event.call?.isSystemTest === true,
      }));
  }

  const impactStart = new Date(failureEvents.reduce((earliest,event)=>Math.min(earliest,event.startedAt.getTime()),start.getTime()));
  const impacts = failureEvents.length && effectiveEnd > impactStart ? await prisma.callImpactInterval.findMany({
    where: {
      machineId: {in:[...new Set(failureEvents.map(event=>event.machineId))]},
      startedAt: { lt: effectiveEnd },
      OR: [{ endedAt: null }, { endedAt: { gt: impactStart } }],
      call: policy.callWhere,
    },
    select: { id: true, machineId: true, startedAt: true, endedAt: true,
      call: { select: { failureResponsibility: true } } },
  }) : [];
  const causalEpisodes = buildCausalEpisodes(failureEvents, impacts.map(row => ({ ...row, failureResponsibility: row.call.failureResponsibility })));
  const exclusionScope: Prisma.AndonCallWhereInput = {
    ...dimensionsWhere,
    OR: [{ openedAt: { gte: start, lt: effectiveEnd } }, { attendedAt: { gte: start, lt: effectiveEnd } }, { finishedAt: { gte: start, lt: effectiveEnd } }],
  };
  // SQL NOT(nullable predicate) is not the complement of eligibility: UNKNOWN
  // also fails a WHERE. Count both populations in one consistent snapshot.
  const [scopedCalls, eligibleCalls] = await prisma.$transaction([
    prisma.andonCall.count({where:exclusionScope}),
    prisma.andonCall.count({where:{...policy.callWhere,...exclusionScope}}),
  ], {isolationLevel:"RepeatableRead"});
  const excludedCalls = scopedCalls-eligibleCalls;

  return { calls, activeCallsNow, failureEvents, reliabilityAssets, causalEpisodes, excludedCalls };
}

function clipMinutes(startedAt: Date, endedAt: Date | null, start: Date, end: Date) {
  const clippedStart = Math.max(start.getTime(), startedAt.getTime());
  const clippedEnd = Math.min(end.getTime(), endedAt?.getTime() ?? end.getTime());
  return Math.max(0, Math.round(((clippedEnd - clippedStart) / 60_000) * 100) / 100);
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  // BI-only workstations receive filter metadata without access to operational snapshots.
  app.get("/api/analytics/filter-options", async (request) => {
    const allowedIds = scopedMachineReadIds(request);
    const [machines, sectors, classifications] = await Promise.all([
      prisma.machine.findMany({
        where: allowedIds === null ? undefined : { id: { in: [...allowedIds] } },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.andonCategory.findMany({ select: { id: true, displayName: true, active: true, categoryGroup: true } }),
      prisma.failureClassification.findMany({ select: { id: true, label: true, value: true, active: true } }),
    ]);
    return { machines, sectors, classifications };
  });
  await registerAnalyticsDataQualityRoutes(app);

  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/overview",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);

      if (!period) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios, devem incluir fuso horário e startDate deve ser anterior a endDate",
        );
      }

      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };
      const durationMs = Math.max(0, effectiveEnd.getTime() - period.start.getTime());
      const previousEnd = period.start;
      const previousStart = new Date(previousEnd.getTime() - durationMs);

      const [currentData, previousData] = await Promise.all([
        loadOverviewDataset(
          period.start,
          period.end,
          effectiveEnd,
          filters,
          true,
        ),
        loadOverviewDataset(
          previousStart,
          previousEnd,
          previousEnd,
          filters,
          false,
        ),
      ]);

      // The mode history is not a shift calendar. Missing intervals remain
      // unmeasured rather than assuming every hour was scheduled.
      const assets = currentData.reliabilityAssets;
      const productionEvents = assets?.length
        ? await prisma.machineProductionEvent.findMany({
            where: {
              machineId: { in: assets.map((asset) => asset.machineId) },
              startedAt: { lt: effectiveEnd },
              OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
            },
            select: {
              machineId: true,
              productionMode: true,
              startedAt: true,
              endedAt: true,
            },
          })
        : [];
      const production = buildPlannedProductionKpis({
        assets,
        productionEvents,
        failureEvents: currentData.failureEvents,
        causalEpisodes: currentData.causalEpisodes,
        start: period.start,
        effectiveEnd,
        timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
      });

      const currentOverview = buildExecutiveOverview({
        ...currentData,
        start: period.start,
        end: period.end,
        effectiveEnd,
        generatedAt,
        timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
        filters,
      });
      const previousOverview = buildExecutiveOverview({
        ...previousData,
        start: previousStart,
        end: previousEnd,
        effectiveEnd: previousEnd,
        generatedAt,
        timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
        filters,
      });

      return {
        ...currentOverview,
        production,
        responsibility: {
          downtime: summarizeCausalDowntime(currentData.causalEpisodes, period.start, effectiveEnd),
          excludedCalls: currentData.excludedCalls,
          pendingFinishedCalls: currentData.calls.filter(call => call.status === "finished" && call.finishedAt && call.finishedAt >= period.start && call.finishedAt < effectiveEnd && (!call.failureResponsibility || call.failureResponsibility === "unassigned")).length,
        },
        comparison: {
          period: {
            start: previousStart.toISOString(),
            end: previousEnd.toISOString(),
          },
          ...buildOverviewComparison(currentOverview, previousOverview),
        },
        highlights: buildExecutiveHighlights(currentOverview),
      };
    },
  );

  // BI-12: analytical time-of-day patterns. No operational writes.
  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/temporal",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);
      if (!period) {
        return badRequest(reply, "startDate e endDate válidos com fuso são obrigatórios");
      }
      if (period.end.getTime() - period.start.getTime() > 31 * 24 * 60 * 60 * 1000) {
        return badRequest(reply, "O limite desta visualização temporal é de 31 dias");
      }
      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd = new Date(Math.min(generatedAt.getTime(), period.end.getTime()));
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };
      const data = effectiveEnd.getTime() > period.start.getTime()
        ? await loadOverviewDataset(period.start, period.end, effectiveEnd, filters, false)
        : { calls: [], failureEvents: [] };
      return {
        meta: {
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
          filters,
          exclusions: { systemTests: true, testClassifications: true, falseCalls: true, duplicates: true, cancelledCalls: true },
        },
        ...buildTemporalPatterns({
          calls: data.calls,
          failureEvents: data.failureEvents,
          start: period.start,
          effectiveEnd,
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
        }),
      };
    },
  );

  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/machine-360",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);
      const machineId = optionalQueryString(request.query.machineId);
      if (!period || !machineId) {
        return badRequest(reply, "machineId, startDate e endDate válidos são obrigatórios");
      }

      // This endpoint is strictly one-machine: reject out-of-scope IDs before
      // querying settings, machine metadata, calls, events or technician sessions.
      // Full-scope and legacy readers retain the existing result contract.
      let allowedIds: readonly string[] | null;
      try {
        allowedIds = scopedMachineReadIds(request);
      } catch (error) {
        if (error instanceof AccessError) {
          return reply.code(error.statusCode).send({ error: "permission_denied" });
        }
        throw error;
      }
      if (allowedIds !== null && !allowedIds.includes(machineId)) {
        return reply.code(404).send({ error: "Máquina não encontrada" });
      }

      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd = new Date(
        Math.min(period.end.getTime(), generatedAt.getTime()),
      );
      const subtype = optionalQueryString(request.query.subtype);
      const classification = optionalQueryString(request.query.classification);

      const machine = await prisma.machine.findUnique({
        where: { id: machineId },
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          machineStatus: true,
          productionMode: true,
        },
      });
      if (!machine) {
        return reply.code(404).send({ error: "Máquina não encontrada" });
      }

      const callDimensions: Prisma.AndonCallWhereInput = {
        machineId,
        ...policy.callWhere,
        ...(subtype ? { subtype } : {}),
        ...(classification ? { failureClassification: classification } : {}),
      };
      const [calls, currentCalls, rawEvents, sessions] = await Promise.all([
        prisma.andonCall.findMany({
          where: {
            ...callDimensions,
            OR: [
              { openedAt: { gte: period.start, lt: effectiveEnd } },
              { attendedAt: { gte: period.start, lt: effectiveEnd } },
              { finishedAt: { gte: period.start, lt: effectiveEnd } },
            ],
          },
          select: {
            id: true,
            machineId: true,
            subtype: true,
            status: true,
            openedAt: true,
            attendedAt: true,
            finishedAt: true,
            attendanceMinutes: true,
            failureClassification: true,
            failureResponsibility: true, analyticsDisposition: true,
            failureDescription: true,
            workOrderNumber: true,
            maintenanceReturnCount: true,
            technicianNames: true,
            isSystemTest: true,
            machineSetNameSnapshot: true,
            machineSubsetNameSnapshot: true,
            confirmedMachineSetNameSnapshot: true,
            confirmedMachineSubsetNameSnapshot: true,
          },
        }),
        prisma.andonCall.findMany({
          where: {
            machineId,
            ...policy.callWhere,
            status: { in: ACTIVE_CALL_STATUSES },
            ...(subtype ? { subtype } : {}),
            // Classification is a finalized diagnosis, not a current-state dimension.
          },
          select: {
            id: true,
            machineId: true,
            subtype: true,
            status: true,
            openedAt: true,
            attendedAt: true,
            finishedAt: true,
            attendanceMinutes: true,
            failureClassification: true,
            failureResponsibility: true, analyticsDisposition: true,
            failureDescription: true,
            workOrderNumber: true,
            maintenanceReturnCount: true,
            technicianNames: true,
            isSystemTest: true,
            machineSetNameSnapshot: true,
            machineSubsetNameSnapshot: true,
            confirmedMachineSetNameSnapshot: true,
            confirmedMachineSubsetNameSnapshot: true,
          },
        }),
        effectiveEnd.getTime() > period.start.getTime()
          ? prisma.failureEvent.findMany({
              where: {
                ...policy.eventWhere,
                machineId,
                ...(classification ? { classification } : {}),
                startedAt: { lt: effectiveEnd },
                OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
              },
              select: {
                id: true,
                machineId: true,
                callId: true,
                startedAt: true,
                endedAt: true,
                classification: true,
                failureResponsibility: true, analyticsDisposition: true,
                notes: true,
                call: { select: { isSystemTest: true, subtype: true } },
              },
            })
          : Promise.resolve([]),
        prisma.technicianSession.findMany({
          where: {
            machineId,
            endedAt: null,
            call: {
              ...policy.callWhere,
              ...(subtype ? { subtype } : {}),
            },
          },
          select: { id: true, startedAt: true },
        }),
      ]);

      const events = rawEvents
        .filter((event) => event.call?.isSystemTest !== true)
        .filter((event) =>
          !subtype || (event.call !== null && event.call.subtype === subtype),
        )
        .map((event) => ({
          id: event.id,
          machineId: event.machineId,
          callId: event.callId,
          startedAt: event.startedAt,
          endedAt: event.endedAt,
          classification: event.classification,
          failureResponsibility: event.failureResponsibility, analyticsDisposition: event.analyticsDisposition,
          notes: event.notes,
          linkedCallIsSystemTest: false,
        }));

      // The BI-11 historical cohort includes up to 30 days before the start.
      // Past sector assignments are never used to erase a valid antecedent.
      const historyStart = new Date(period.start.getTime() - 30 * 24 * 60 * 60 * 1000);
      const historicalFinished = effectiveEnd.getTime() > period.start.getTime()
        ? await prisma.andonCall.findMany({
            where: {
              machineId,
              ...policy.callWhere,
              status: "finished",
              finishedAt: { gte: historyStart, lt: effectiveEnd },
              failureClassification: { not: null },
            },
            select: {
              id: true, subtype: true, finishedAt: true, openedAt: true,
              failureClassification: true,
              failureResponsibility: true, analyticsDisposition: true, workOrderNumber: true,
              failureDescription: true, maintenanceReturnCount: true,
              isSystemTest: true,
              machineSetId: true, machineSetNameSnapshot: true,
              machineSubsetId: true, machineSubsetNameSnapshot: true,
              confirmedMachineSetId: true, confirmedMachineSetNameSnapshot: true,
              confirmedMachineSubsetId: true, confirmedMachineSubsetNameSnapshot: true,
            },
            orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
          })
        : [];
      const recurrence = buildMachine360Recurrence({
        calls: historicalFinished.flatMap((call) =>
          call.finishedAt ? [{
            id: call.id,
            subtype: call.subtype,
            finishedAt: call.finishedAt,
            openedAt: call.openedAt,
            classification: call.failureClassification,
            workOrderNumber: call.workOrderNumber,
            description: call.failureDescription,
            maintenanceReturnCount: call.maintenanceReturnCount,
            isSystemTest: call.isSystemTest,
            machineSetId: call.machineSetId,
            machineSetNameSnapshot: call.machineSetNameSnapshot,
            machineSubsetId: call.machineSubsetId,
            machineSubsetNameSnapshot: call.machineSubsetNameSnapshot,
            confirmedMachineSetId: call.confirmedMachineSetId,
            confirmedMachineSetNameSnapshot: call.confirmedMachineSetNameSnapshot,
            confirmedMachineSubsetId: call.confirmedMachineSubsetId,
            confirmedMachineSubsetNameSnapshot: call.confirmedMachineSubsetNameSnapshot,
          }] : [],
        ),
        start: period.start,
        effectiveEnd,
        subtype,
        classification,
      });

      return {
        meta: {
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
          filters: { machineId, subtype, classification },
          semantics: {
            downtime: "união dos intervalos FailureEvent sobrepostos, por máquina e recortados ao período; não soma tempos de chamados",
            physicalStopEpisodes: "episódios físicos unidos no período, não contagem bruta de FailureEvents",
            mtbf: "estimativa por exposição calendário menos downtime físico, não horas produtivas reais",
            avgDowntime: "downtime unido dividido pelos episódios físicos no período; inclui episódios ainda abertos",
            mtta: "abertura até primeiro atendimento dos chamados atendidos no período",
            active: "snapshot atual; não aplica classificação a chamados/sessões ainda ativos",
            classification: "diagnóstico de chamado e classificação de evento físico são domínios distintos",
            hierarchy: "conjunto e subconjunto registrados historicamente no chamado; confirmação tem preferência",
            history: "eventos físicos e chamados são exibidos separadamente e não devem ter durações somadas",
            recurrence: "diagnóstico repetido em novo chamado finalizado; por conjunto e subconjunto exige identidade histórica correspondente, sem inferir causa raiz",
          },
        },
        ...buildMachine360({
          machine,
          calls,
          activeCalls: currentCalls,
          events,
          activeSessions: sessions,
          start: period.start,
          effectiveEnd,
        }),
        recurrence,
      };
    },
  );

  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/failure-intelligence",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);
      if (!period) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios, com fuso horário e startDate anterior a endDate",
        );
      }

      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };
      const historyStart = new Date(period.start.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Histórico da mesma máquina e diagnóstico, independente do setor antigo.
      // O setor selecionado delimita a coorte finalizada, não seus antecedentes.
      const history = effectiveEnd.getTime() > period.start.getTime()
        ? await prisma.andonCall.findMany({
            where: {
              ...policy.callWhere,
              status: "finished",
              finishedAt: { gte: historyStart, lt: effectiveEnd },
              failureClassification: filters.classification
                ? filters.classification
                : { not: null },
              ...(filters.machineId ? { machineId: filters.machineId } : {}),
            },
            select: {
              id: true,
              machineId: true,
              machine: { select: { name: true } },
              subtype: true,
              openedAt: true,
              finishedAt: true,
              failureClassification: true,
              failureResponsibility: true, analyticsDisposition: true,
              failureDescription: true,
              workOrderNumber: true,
              maintenanceReturnCount: true,
              isSystemTest: true,
              confirmedMachineSetId: true,
              confirmedMachineSetNameSnapshot: true,
              confirmedMachineSubsetId: true,
              confirmedMachineSubsetNameSnapshot: true,
              machineSetId: true,
              machineSetNameSnapshot: true,
              machineSubsetId: true,
              machineSubsetNameSnapshot: true,
            },
            orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
          })
        : [];

      const result = buildFailureIntelligence({
        calls: history.flatMap((call) =>
          call.finishedAt
            ? [{
                id: call.id,
                machineId: call.machineId,
                machineName: call.machine.name,
                subtype: call.subtype,
                openedAt: call.openedAt,
                finishedAt: call.finishedAt,
                classification: call.failureClassification,
                description: call.failureDescription,
                workOrderNumber: call.workOrderNumber,
                maintenanceReturnCount: call.maintenanceReturnCount,
                isSystemTest: call.isSystemTest,
                confirmedMachineSetId: call.confirmedMachineSetId,
                confirmedMachineSetNameSnapshot: call.confirmedMachineSetNameSnapshot,
                confirmedMachineSubsetId: call.confirmedMachineSubsetId,
                confirmedMachineSubsetNameSnapshot: call.confirmedMachineSubsetNameSnapshot,
                machineSetId: call.machineSetId,
                machineSetNameSnapshot: call.machineSetNameSnapshot,
                machineSubsetId: call.machineSubsetId,
                machineSubsetNameSnapshot: call.machineSubsetNameSnapshot,
              }]
            : [],
        ),
        start: period.start,
        effectiveEnd,
        filters,
      });

      return {
        meta: {
          metricDefinitionVersion: METRIC_VERSION,
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
          filters,
          semantics: {
            cohort:
              "chamados reais finalizados no período (finishedAt), com classificação preenchida",
            recurrence:
              "novo diagnóstico igual na mesma máquina até 24h, 7d ou 30d após conclusão anterior; não presume mesma causa raiz",
            lookback:
              "consulta 30 dias anteriores ao início do período para identificar antecedente; setor filtra coorte, não o diagnóstico histórico",
            assets:
              "conjunto e subconjunto históricos confirmados, com fallback para snapshots da abertura; ausentes continuam desconhecidos",
            returns:
              "ciclos de retorno à manutenção registrados no próprio chamado, separados das reincidências entre chamados",
          },
        },
        ...result,
      };
    },
  );

  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/maintenance",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);

      if (!period) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios, devem incluir fuso horário e startDate deve ser anterior a endDate",
        );
      }

      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };

      const sessions =
        effectiveEnd.getTime() > period.start.getTime()
          ? await prisma.technicianSession.findMany({
              where: {
                ...(filters.machineId ? { machineId: filters.machineId } : {}),
                startedAt: { lt: effectiveEnd },
                OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
                call: {
                  ...policy.callWhere,
                  ...(filters.subtype ? { subtype: filters.subtype } : {}),
                  ...(filters.classification
                    ? { failureClassification: filters.classification }
                    : {}),
                },
              },
              select: {
                id: true,
                callId: true,
                machineId: true,
                technicianId: true,
                call: { select: { failureResponsibility: true } },
                technicianName: true,
                technicalArea: true,
                phase: true,
                cycleIndex: true,
                startedAt: true,
                endedAt: true,
              },
            })
          : [];

      return {
        meta: {
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
          filters,
          semantics: {
            personMinutes:
              "união temporal por técnico, recortada ao período; técnicos diferentes simultâneos somam pessoa-minutos; sobreposição do mesmo técnico não duplica horas; conflitos de fase ficam não classificados",
            phases:
              "somente sessões com phase maintenance/follow_up são atribuídas às fases; legado sem phase permanece não classificado",
            interpretation:
              "distribuição de participação técnica; não representa ranking de desempenho nem capacidade de equipe",
          },
        },
        ...buildMaintenanceParticipation({
          sessions: sessions.map(session => ({ ...session, failureResponsibility: session.call.failureResponsibility })),
          start: period.start,
          effectiveEnd,
        }),
      };
    },
  );

  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/reliability",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);

      if (!period) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios, devem incluir fuso horário e startDate deve ser anterior a endDate",
        );
      }

      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };

      const includeInactive = request.query.includeInactive === "true";
      const machineWhere: Prisma.MachineWhereInput = filters.machineId
        ? { id: filters.machineId }
        : {
            ...(includeInactive ? {} : { isActive: true }),
            createdAt: { lt: effectiveEnd },
          };

      const callScopeWhere: Prisma.AndonCallWhereInput = {
        ...policy.callWhere,
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.subtype ? { subtype: filters.subtype } : {}),
      };

      const [
        machines,
        calls,
        rawFailureEvents,
        activeCalls,
        activeSessions,
        healthOpenFailureEvents,
        finishedCallsMissingClassification,
      ] = await Promise.all([
        prisma.machine.findMany({
          where: machineWhere,
          select: {
            id: true,
            name: true,
            isActive: true,
            createdAt: true,
          },
        }),
        prisma.andonCall.findMany({
          where: {
            ...callScopeWhere,
            ...(filters.classification
              ? { failureClassification: filters.classification }
              : {}),
            OR: [
              { openedAt: { gte: period.start, lt: effectiveEnd } },
              { finishedAt: { gte: period.start, lt: effectiveEnd } },
            ],
          },
          select: {
            id: true,
            machineId: true,
            status: true,
            openedAt: true,
            finishedAt: true,
            failureClassification: true,
            failureResponsibility: true, analyticsDisposition: true,
            maintenanceReturnCount: true,
          },
        }),
        effectiveEnd.getTime() > period.start.getTime()
          ? prisma.failureEvent.findMany({
              where: {
                ...policy.eventWhere,
                ...(filters.machineId ? { machineId: filters.machineId } : {}),
                ...(filters.classification
                  ? { classification: filters.classification }
                  : {}),
                startedAt: { lt: effectiveEnd },
                OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
              },
              select: {
                id: true,
                machineId: true,
                startedAt: true,
                endedAt: true,
                classification: true,
                failureResponsibility: true, analyticsDisposition: true,
                callId: true,
                call: {
                  select: {
                    isSystemTest: true,
                    subtype: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
        prisma.andonCall.findMany({
          where: {
            ...callScopeWhere,
            status: { in: ACTIVE_CALL_STATUSES },
          },
          select: {
            id: true,
            machineId: true,
            status: true,
            openedAt: true,
            finishedAt: true,
            failureClassification: true,
            failureResponsibility: true, analyticsDisposition: true,
            maintenanceReturnCount: true,
          },
        }),
        prisma.technicianSession.findMany({
          where: {
            endedAt: null,
            ...(filters.machineId ? { machineId: filters.machineId } : {}),
            call: {
              ...policy.callWhere,
              ...(filters.subtype ? { subtype: filters.subtype } : {}),
            },
          },
          select: {
            id: true,
            machineId: true,
            startedAt: true,
          },
        }),
        prisma.failureEvent.findMany({
          where: {
            ...policy.eventWhere,
            endedAt: null,
            ...(filters.machineId ? { machineId: filters.machineId } : {}),
          },
          select: {
            id: true,
            machineId: true,
            startedAt: true,
            endedAt: true,
            classification: true,
            failureResponsibility: true, analyticsDisposition: true,
            callId: true,
            call: {
              select: {
                isSystemTest: true,
                subtype: true,
              },
            },
          },
        }),
        prisma.andonCall.count({
          where: {
            ...callScopeWhere,
            status: "finished",
            finishedAt: { gte: period.start, lt: effectiveEnd },
            OR:[{failureClassification:null},{failureClassification:{in:GENERIC_DIAGNOSES}}],
          },
        }),
      ]);

      const failureEvents = rawFailureEvents
        .filter((event) => event.call?.isSystemTest !== true)
        .filter(
          (event) =>
            !filters.subtype ||
            (event.call !== null && event.call.subtype === filters.subtype),
        )
        .map((event) => ({
          id: event.id,
          machineId: event.machineId,
          startedAt: event.startedAt,
          endedAt: event.endedAt,
          classification: event.classification,
          failureResponsibility: event.failureResponsibility, analyticsDisposition: event.analyticsDisposition,
          callId: event.callId,
        }));

      const healthOpenEvents = healthOpenFailureEvents
        .filter((event) => event.call?.isSystemTest !== true)
        .filter(
          (event) =>
            !filters.subtype ||
            (event.call !== null && event.call.subtype === filters.subtype),
        );

      const result = buildAssetReliability({
        machines,
        failureEvents,
        calls,
        activeCalls,
        activeSessions,
        start: period.start,
        effectiveEnd,
      });

      const ageMinutes = (value: Date) =>
        Math.max(
          0,
          Math.round(
            ((generatedAt.getTime() - value.getTime()) / 60_000) * 100,
          ) / 100,
        );
      const activeCallAges = activeCalls.map((call) => ageMinutes(call.openedAt));
      const activeSessionAges = activeSessions.map((session) =>
        ageMinutes(session.startedAt),
      );
      const openFailureAges = healthOpenEvents.map((event) =>
        ageMinutes(event.startedAt),
      );

      return {
        meta: {
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
          filters,
          semantics: {
            badActors:
              "ativos ordenados por downtime físico unido; não há score oculto ou ponderação subjetiva. O parâmetro includeInactive permite comparar máquinas ativas e inativas.",
            repeatDiagnosis:
              "repetições adicionais da mesma classificação em chamados concluídos da mesma máquina no período; não equivale a causa raiz",
            dataHealth:
              "snapshot operacional atual; respeita máquina/setor e não aplica classificação a registros ainda ativos",
          },
        },
        assets: result.assets,
        dataHealth: {
          ...result.dataHealth,
          activeCallsOver24h: activeCallAges.filter(
            (minutes) => minutes >= 24 * 60,
          ).length,
          oldestActiveCallMinutes:
            activeCallAges.length ? Math.max(...activeCallAges) : 0,
          openFailureEvents: openFailureAges.length,
          openFailureEventsOver24h: openFailureAges.filter(
            (minutes) => minutes >= 24 * 60,
          ).length,
          oldestOpenFailureMinutes:
            openFailureAges.length ? Math.max(...openFailureAges) : 0,
          activeSessionsOver24h: activeSessionAges.filter(
            (minutes) => minutes >= 24 * 60,
          ).length,
          oldestActiveSessionMinutes:
            activeSessionAges.length ? Math.max(...activeSessionAges) : 0,
          finishedCallsMissingClassification,
          standaloneFailureEvents: failureEvents.filter(
            (event) => !event.callId,
          ).length,
        },
      };
    },
  );

  app.get<{ Querystring: AnalyticsDrilldownQuery }>(
    "/api/analytics/drilldown",
    async (request, reply) => {
      const period = parseAnalyticsPeriod(request.query);
      const dimension = optionalQueryString(request.query.dimension);
      const value = optionalQueryString(request.query.value);

      if (!period) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios, devem incluir fuso horário e startDate deve ser anterior a endDate",
        );
      }
      if (!dimension || !DRILLDOWN_DIMENSIONS.has(dimension)) {
        return badRequest(reply, "Dimensão de detalhamento inválida");
      }
      if (!value) return badRequest(reply, "Valor do detalhamento é obrigatório");

      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };
      // Bind only the server-authorized machine scope. For classification/sector,
      // apply the scope in SQL before limit/orderBy to avoid cross-machine leaks.
      let allowedIds: readonly string[] | null;
      try {
        allowedIds = scopedMachineReadIds(request);
      } catch (error) {
        if (error instanceof AccessError) {
          return reply.code(error.statusCode).send({ error: "permission_denied" });
        }
        throw error;
      }
      if (allowedIds !== null && (
        (dimension === "machine" && !allowedIds.includes(value)) ||
        (filters.machineId && !allowedIds.includes(filters.machineId))
      )) {
        return reply.code(404).send({ error: "Máquina não encontrada" });
      }
      const machineWhere: Prisma.AndonCallWhereInput =
        filters.machineId
          ? { machineId: filters.machineId }
          : allowedIds === null
            ? {}
            : { machineId: { in: [...allowedIds] } };

      const policy = await loadAnalyticsEligibility();
      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const limit = parseDrilldownLimit(request.query.limit);

      if (dimension === "machine") {
        const events = await prisma.failureEvent.findMany({
          where: {
            ...policy.eventWhere,
            machineId: value,
            ...(filters.classification
              ? { classification: filters.classification }
              : {}),
            startedAt: { lt: effectiveEnd },
            OR: [{ endedAt: null }, { endedAt: { gt: period.start } }],
          },
          select: {
            id: true,
            callId: true,
            machineId: true,
            startedAt: true,
            endedAt: true,
            classification: true,
            failureResponsibility: true, analyticsDisposition: true,
            notes: true,
            source: true,
            machine: { select: { name: true } },
            call: {
              select: {
                isSystemTest: true,
                subtype: true,
                status: true,
                workOrderNumber: true,
                failureDescription: true,
                technicianNames: true,
              },
            },
          },
          orderBy: { startedAt: "desc" },
          take: 100,
        });

        const items = events
          .filter((event) => event.call?.isSystemTest !== true)
          .filter(
            (event) =>
              !filters.subtype ||
              (event.call !== null && event.call.subtype === filters.subtype),
          )
          .slice(0, limit)
          .map((event) => ({
            kind: "failure_event" as const,
            id: event.id,
            callId: event.callId,
            machineId: event.machineId,
            machineName: event.machine.name,
            subtype: event.call?.subtype ?? null,
            classification: event.classification,
            failureResponsibility: event.failureResponsibility, analyticsDisposition: event.analyticsDisposition,
            occurredAt: event.startedAt.toISOString(),
            endedAt: event.endedAt?.toISOString() ?? null,
            durationMinutes: clipMinutes(
              event.startedAt,
              event.endedAt,
              period.start,
              effectiveEnd,
            ),
            status: event.call?.status ?? null,
            workOrderNumber: event.call?.workOrderNumber ?? null,
            technicianNames: event.call?.technicianNames ?? [],
            description: event.call?.failureDescription ?? event.notes,
            source: event.source,
          }));

        return {
          meta: {
            generatedAt: generatedAt.toISOString(),
            timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
            period: {
              start: period.start.toISOString(),
              end: period.end.toISOString(),
              effectiveEnd: effectiveEnd.toISOString(),
            },
          },
          dimension,
          value,
          items,
        };
      }

      const callWhere: Prisma.AndonCallWhereInput =
        dimension === "classification"
          ? {
              ...policy.callWhere,
              status: "finished",
              failureClassification: value,
              finishedAt: { gte: period.start, lt: effectiveEnd },
              ...machineWhere,
              ...(filters.subtype ? { subtype: filters.subtype } : {}),
            }
          : {
              ...policy.callWhere,
              subtype: value,
              openedAt: { gte: period.start, lt: effectiveEnd },
              ...machineWhere,
              ...(filters.classification
                ? { failureClassification: filters.classification }
                : {}),
            };

      const calls = await prisma.andonCall.findMany({
        where: callWhere,
        select: {
          id: true,
          machineId: true,
          subtype: true,
          status: true,
          openedAt: true,
          finishedAt: true,
          totalCallMinutes: true,
          failureClassification: true,
          failureResponsibility: true, analyticsDisposition: true,
          failureDescription: true,
          workOrderNumber: true,
          technicianNames: true,
          machine: { select: { name: true } },
        },
        orderBy:
          dimension === "classification"
            ? [{ finishedAt: "desc" }, { openedAt: "desc" }]
            : [{ openedAt: "desc" }],
        take: limit,
      });

      return {
        meta: {
          generatedAt: generatedAt.toISOString(),
          timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
          period: {
            start: period.start.toISOString(),
            end: period.end.toISOString(),
            effectiveEnd: effectiveEnd.toISOString(),
          },
        },
        dimension,
        value,
        items: calls.map((call) => ({
          kind: "call" as const,
          id: call.id,
          callId: call.id,
          machineId: call.machineId,
          machineName: call.machine.name,
          subtype: call.subtype,
          classification: call.failureClassification,
          occurredAt:
            dimension === "classification"
              ? (call.finishedAt ?? call.openedAt).toISOString()
              : call.openedAt.toISOString(),
          endedAt: call.finishedAt?.toISOString() ?? null,
          // An unfinished call has no frozen total duration. A stored default
          // zero must not be presented as a completed zero-minute call.
          durationMinutes: call.finishedAt
            ? (call.totalCallMinutes ??
              Math.max(
                0,
                Math.round(
                  ((call.finishedAt.getTime() - call.openedAt.getTime()) / 60_000) * 100,
                ) / 100,
              ))
            : null,
          status: call.status,
          workOrderNumber: call.workOrderNumber,
          technicianNames: call.technicianNames,
          description: call.failureDescription,
          source: "andon_call",
        })),
      };
    },
  );
}
