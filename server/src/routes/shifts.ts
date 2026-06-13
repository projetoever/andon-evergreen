import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function registerShiftRoutes(app: FastifyInstance) {
  app.get("/api/shifts", async () =>
    prisma.shift.findMany({
      orderBy: { name: "asc" },
    }),
  );
}
