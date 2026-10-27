import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { TLSSocket } from "node:tls";
import { prisma } from "../db/prisma.js";
import { appendAudit } from "../access/audit.js";
import { tokenHash } from "../access/credentials.js";
import { centralAccessEnabled } from "../access/http.js";
import { issueIndustrialServiceSession } from "../access/industrialServices.js";
import { AccessError } from "../access/policy.js";

export function registerIndustrialServiceAuthRoutes(
  app: FastifyInstance,
  db: PrismaClient = prisma,
) {
  const buckets = new Map<string, { count: number; until: number }>();
  const limited = (key: string) => {
    const now = Date.now();
    for (const [entry, bucket] of buckets) if (bucket.until <= now) buckets.delete(entry);
    const bucket = buckets.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 };
    if (!buckets.has(key) && buckets.size >= 5000) throw new AccessError("rate_limited", 429);
    bucket.count++;
    buckets.set(key, bucket);
    if (bucket.count > 10) throw new AccessError("rate_limited", 429);
  };

  app.post<{
    Body: { clientId: string; clientSecret: string };
  }>(
    "/api/service-auth/token",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["clientId", "clientSecret"],
          properties: {
            clientId: { type: "string", minLength: 1, maxLength: 120 },
            clientSecret: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      if (!centralAccessEnabled()) return reply.status(404).send({ error: "not_found" });
      if (!(request.raw.socket as TLSSocket).encrypted)
        return reply.status(426).send({ error: "https_required" });
      if (request.headers.origin) return reply.status(403).send({ error: "service_origin_denied" });
      try {
        limited(`ip:${request.ip}`);
        limited(`client:${tokenHash(request.body.clientId)}`);
        return await issueIndustrialServiceSession(db, request.body, {
          ipAddress: request.ip,
          requestId: request.id,
        });
      } catch (error) {
        const accessError = error instanceof AccessError ? error : null;
        const code = accessError?.code ?? "service_auth_unavailable";
        if (accessError && accessError.statusCode < 500)
          await appendAudit(
            db,
            {
              actorType: "service",
              actorLogin: request.body.clientId,
              ipAddress: request.ip,
              requestId: request.id,
            },
            {
              action: "industrial_service.session.denied",
              resourceType: "industrial_service",
              resourceId: request.body.clientId,
              result: "denied",
              reason: code,
            },
          );
        return reply.status(accessError?.statusCode ?? 503).send({ error: code });
      }
    },
  );
}
