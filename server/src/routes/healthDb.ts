import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";

export async function registerHealthDbRoute(app: FastifyInstance) {
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
