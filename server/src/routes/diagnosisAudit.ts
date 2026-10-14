import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { badRequest } from "./routeUtils.js";

/** GET protegido por sessão administrativa em adminAuthorization. */
export async function registerDiagnosisAuditRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { callId?: string; failureEventId?: string; limit?: string } }>(
    "/api/diagnosis-audit",
    async (request, reply) => {
      const { callId, failureEventId } = request.query;
      if (!callId && !failureEventId) return badRequest(reply, "Informe callId ou failureEventId");
      const requested = Number(request.query.limit ?? "100");
      const take = Number.isFinite(requested) ? Math.max(1, Math.min(200, Math.floor(requested))) : 100;
      return prisma.failureDiagnosisAudit.findMany({
        where: { ...(callId ? { callId } : {}), ...(failureEventId ? { failureEventId } : {}) },
        orderBy: { createdAt: "desc" },
        take,
      });
    },
  );
}
