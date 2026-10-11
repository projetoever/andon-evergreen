import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import {
  buildExecutiveOverview,
  parseAnalyticsInstant,
  type AnalyticsFailureEventRecord,
  type AnalyticsOverviewFilters,
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

const ACTIVE_CALL_STATUSES = ["open", "in_progress", "post_maintenance"];
const DEFAULT_OPERATIONAL_TIME_ZONE =
  process.env.ANDON_TIME_ZONE?.trim() || "America/Sao_Paulo";

function optionalQueryString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: AnalyticsOverviewQuery }>(
    "/api/analytics/overview",
    async (request, reply) => {
      const start = parseAnalyticsInstant(request.query.startDate);
      const end = parseAnalyticsInstant(request.query.endDate);

      if (!start || !end) {
        return badRequest(
          reply,
          "startDate e endDate são obrigatórios e devem incluir fuso horário (Z ou ±HH:MM)",
        );
      }

      if (start.getTime() >= end.getTime()) {
        return badRequest(reply, "startDate deve ser anterior a endDate");
      }

      const generatedAt = new Date();
      const effectiveEnd =
        end.getTime() < generatedAt.getTime() ? end : generatedAt;

      const filters: AnalyticsOverviewFilters = {
        machineId: optionalQueryString(request.query.machineId),
        subtype: optionalQueryString(request.query.subtype),
        classification: optionalQueryString(request.query.classification),
      };

      const dimensionsWhere: Prisma.AndonCallWhereInput = {
        ...(filters.machineId ? { machineId: filters.machineId } : {}),
        ...(filters.subtype ? { subtype: filters.subtype } : {}),
        ...(filters.classification
          ? { failureClassification: filters.classification }
          : {}),
      };

      const calls = await prisma.andonCall.findMany({
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
      });

      const activeCallsNow = filters.classification
        ? null
        : await prisma.andonCall.count({
            where: {
              isSystemTest: false,
              status: { in: ACTIVE_CALL_STATUSES },
              ...(filters.machineId ? { machineId: filters.machineId } : {}),
              ...(filters.subtype ? { subtype: filters.subtype } : {}),
            },
          });

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

      return buildExecutiveOverview({
        calls,
        activeCallsNow,
        failureEvents,
        start,
        end,
        effectiveEnd,
        generatedAt,
        timeZone: DEFAULT_OPERATIONAL_TIME_ZONE,
        filters,
      });
    },
  );
}
