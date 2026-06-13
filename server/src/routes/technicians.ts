import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { parseBoolean } from "./routeUtils.js";

type TechnicianQuery = {
  active?: string;
  technicalArea?: string;
  shiftId?: string;
};

export async function registerTechnicianRoutes(app: FastifyInstance) {
  app.get<{ Querystring: TechnicianQuery }>("/api/technicians", async (request) => {
    const active = parseBoolean(request.query.active);
    const { technicalArea, shiftId } = request.query;
    const where: Prisma.TechnicianWhereInput = {
      ...(active !== undefined ? { active } : {}),
      ...(technicalArea ? { technicalArea } : {}),
      ...(shiftId ? { shiftId } : {}),
    };

    return prisma.technician.findMany({
      where,
      orderBy: { name: "asc" },
    });
  });
}
