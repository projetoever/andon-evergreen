import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

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
import { badRequest } from "./routeUtils.js";

type AnalyticsOverviewQuery = {
  startDate?: string;
  endDate?: string;
  machineId?: string;
  subtype?: string;
  classification?: string;
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

async function loadOverviewDataset(
  start: Date,
  end: Date,
  effectiveEnd: Date,
  filters: AnalyticsOverviewFilters,
  includeActiveCalls: boolean,
) {
  const dimensionsWhere = callDimensionsWhere(filters);
  const reliabilityEnabled = !filters.subtype && !filters.classification;

  const [calls, activeCallsNow, rawReliabilityAssets] = await Promise.all([
    prisma.andonCall.findMany({
      where: {
        isSystemTest: false,
        ...dimensionsWhere,
        OR: [
          { openedAt: { gte: start, lt: end } },
          { attendedAt: { gte: start, lt: end } },
          { finishedAt: { gte: start, lt: end } },
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
        isSystemTest: true,
      },
    }),
    includeActiveCalls && !filters.classification
      ? prisma.andonCall.count({
          where: {
            isSystemTest: false,
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
    const rawFailureEvents = await prisma.failureEvent.findMany({
      where: {
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.classification
          ? { classification: filters.classification }
          : {}),
        startedAt: { lt: effectiveEnd },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
      },
      select: {
        id: true,
        machineId: true,
        startedAt: true,
        endedAt: true,
        classification: true,
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
      },
    });

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
        callId: event.callId,
        linkedCallIsSystemTest: event.call?.isSystemTest === true,
      }));
  }

  return { calls, activeCallsNow, failureEvents, reliabilityAssets };
}

function clipMinutes(startedAt: Date, endedAt: Date | null, start: Date, end: Date) {
  const clippedStart = Math.max(start.getTime(), startedAt.getTime());
  const clippedEnd = Math.min(end.getTime(), endedAt?.getTime() ?? end.getTime());
  return Math.max(0, Math.round(((clippedEnd - clippedStart) / 60_000) * 100) / 100);
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
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
      const durationMs = period.end.getTime() - period.start.getTime();
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

      const generatedAt = new Date();
      const effectiveEnd =
        period.end.getTime() < generatedAt.getTime() ? period.end : generatedAt;
      const limit = parseDrilldownLimit(request.query.limit);
      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };

      if (dimension === "machine") {
        const events = await prisma.failureEvent.findMany({
          where: {
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
              isSystemTest: false,
              status: "finished",
              failureClassification: value,
              finishedAt: { gte: period.start, lt: period.end },
              ...(filters.machineId ? { machineId: filters.machineId } : {}),
              ...(filters.subtype ? { subtype: filters.subtype } : {}),
            }
          : {
              isSystemTest: false,
              subtype: value,
              openedAt: { gte: period.start, lt: period.end },
              ...(filters.machineId ? { machineId: filters.machineId } : {}),
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
          durationMinutes:
            call.totalCallMinutes ??
            (call.finishedAt
              ? Math.max(
                  0,
                  Math.round(
                    ((call.finishedAt.getTime() - call.openedAt.getTime()) / 60_000) * 100,
                  ) / 100,
                )
              : null),
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
