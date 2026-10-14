import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import {
  parseWorkstationId,
  WORKSTATION_INACTIVE_MESSAGE,
  WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
} from "../services/workstationAuthorization.js";

const ALLOWED_API_PATHS = new Set([
  "/api/workstations/register",
  "/api/admin-auth/login",
]);

/** Prevent a blocked workstation from interacting with the operational API.
 * Devices that integrate without browser Origin headers remain compatible.
 * Workstation UUIDs identify browsers, not immutable hardware identities.
 */
export async function enforceWorkstationAccess(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?", 1)[0] ?? "";
  if (!path.startsWith("/api/") || ALLOWED_API_PATHS.has(path) || path.startsWith("/api/health")) return;

  const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
  if (!id) {
    if (request.headers.origin) {
      return reply.status(403).send({ error: "workstation_identification_required", message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE });
    }
    return;
  }

  const workstation = await prisma.workstation.findUnique({ where: { id }, select: { active: true } });
  if (!workstation) {
    return reply.status(403).send({ error: "workstation_identification_required", message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE });
  }
  if (!workstation.active) {
    return reply.status(403).send({ error: "workstation_inactive", message: WORKSTATION_INACTIVE_MESSAGE });
  }
}
