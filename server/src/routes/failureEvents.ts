import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { parseDate, parseLimit } from "./routeUtils.js";

type FailureEventQuery = {
  machineId?: string;
  startDate?: string;
  endDate?: string;
  classification?: string;
  limit?: string;
};

export async function registerFailureEventRoutes(app: FastifyInstance) {
  app.get<{ Querystring: FailureEventQuery }>("/api/failure-events", async (request) => {
    const { machineId, classification } = request.query;
    const startDate = parseDate(request.query.startDate);
    const endDate = parseDate(request.query.endDate);
    const where: Prisma.FailureEventWhereInput = {
      ...(machineId ? { machineId } : {}),
      ...(classification ? { classification } : {}),
      ...(startDate || endDate
        ? {
            startedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    return prisma.failureEvent.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: parseLimit(request.query.limit),
    });
  });
}
