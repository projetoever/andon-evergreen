import type { FastifyReply, FastifyRequest } from "fastify";
import type { TLSSocket } from "node:tls";
import { prisma } from "../db/prisma.js";
import {
  authenticateIndustrialServiceSession,
  readIndustrialServiceBearer,
  type IndustrialServicePrincipal,
  type IndustrialServiceScope,
} from "../access/industrialServices.js";
import { AccessError } from "../access/policy.js";

declare module "fastify" {
  interface FastifyRequest {
    industrialService?: IndustrialServicePrincipal;
  }
}

const SERVICE_READ_SCOPES = new Map<string, IndustrialServiceScope>([
  ["/api/machines", "machines.read"],
  ["/api/andon-calls", "calls.read"],
  ["/api/dashboard-sound-state", "sound.read"],
]);

export async function authorizeIndustrialService(request: FastifyRequest, reply: FastifyReply) {
  const bearer = readIndustrialServiceBearer(request.headers.authorization);
  if (bearer === null) return false;
  if (!(request.raw.socket as TLSSocket).encrypted)
    return reply.status(426).send({ error: "https_required" });
  if (request.headers.origin) return reply.status(403).send({ error: "service_origin_denied" });
  try {
    const principal = await authenticateIndustrialServiceSession(prisma, bearer);
    const path = request.url.split("?", 1)[0] ?? "";
    const requiredScope = request.method === "GET" ? SERVICE_READ_SCOPES.get(path) : undefined;
    if (!requiredScope || !principal.scopes.includes(requiredScope))
      throw new AccessError("service_scope_denied");
    request.industrialService = principal;
    return false;
  } catch (error) {
    const accessError = error instanceof AccessError ? error : null;
    return reply
      .status(accessError?.statusCode ?? 403)
      .send({ error: accessError?.code ?? "service_auth_denied" });
  }
}
