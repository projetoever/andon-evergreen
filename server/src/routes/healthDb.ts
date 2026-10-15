import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function registerHealthDbRoute(app: FastifyInstance) {
  // Runtime readiness must remain independent of module passwords and operational data access.
  app.get("/health/ready", async (_request, reply) => {
    try {
      const [, , operational, , policy] = await Promise.all([
        prisma.machine.findFirst({ select: { id: true } }),
        prisma.workstation.findFirst({
          select: {
            allowOperational: true,
            allowBi: true,
            allowPriorities: true,
            pendingApproval: true,
          },
        }),
        prisma.moduleCredential.findUnique({
          where: { id: "operational" },
          select: { passwordRequired: true, credentialVersion: true },
        }),
        prisma.dashboardPriorityConfig.findFirst({ select: { passwordRequired: true } }),
        prisma.systemSettings.findUnique({
          where: { id: "global" },
          select: { requireWorkstationApproval: true },
        }),
      ]);
      return {
        status: "ok",
        ready: true,
        operationalPasswordRequired: operational?.passwordRequired ?? false,
        workstationApprovalRequired: policy?.requireWorkstationApproval ?? false,
      };
    } catch (error) {
      app.log.error({ error }, "Banco/schema indisponível para inicialização do Hub");
      return reply
        .status(503)
        .send({ status: "error", ready: false, message: "Banco ou schema do ANDON indisponível." });
    }
  });
  app.get("/health/db", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      return {
        status: "ok",
        database: "postgresql",
        connected: true,
      };
    } catch (error) {
      app.log.error({ error }, "Falha ao verificar conexão com PostgreSQL");

      return {
        status: "error",
        database: "postgresql",
        connected: false,
        message: "Banco de dados indisponível",
      };
    }
  });
}
