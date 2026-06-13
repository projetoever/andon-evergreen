import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { parseBoolean } from "./routeUtils.js";

type FailureClassificationQuery = {
  active?: string;
};

export async function registerFailureClassificationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: FailureClassificationQuery }>(
    "/api/failure-classifications",
    async (request) => {
      const active = parseBoolean(request.query.active);
      const where: Prisma.FailureClassificationWhereInput = {
        ...(active !== undefined ? { active } : {}),
      };

      return prisma.failureClassification.findMany({
        where,
        orderBy: { label: "asc" },
      });
    },
  );
}
