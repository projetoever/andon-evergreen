import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import { readAdminSession } from "./adminAuthorization.js";
import { apiModule, isModuleAllowed, isRecoveryRequest } from "../services/moduleRegistry.js";
import {
  parseWorkstationId,
  WORKSTATION_INACTIVE_MESSAGE,
  WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
} from "../services/workstationAuthorization.js";

const ALLOWED_API_PATHS = new Set([
  "/api/workstations/register",
  "/api/admin-auth/login",
  "/api/admin-auth/recover",
  "/api/admin-auth/status",
]);

/** Prevent a blocked workstation from interacting with the operational API.
 * Integrations without Origin/UUID remain compatible when mandatory approval is off.
 * Workstation UUIDs identify browsers, not immutable hardware identities.
 */
export async function enforceWorkstationAccess(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?", 1)[0] ?? "";
  if (!path.startsWith("/api/") || ALLOWED_API_PATHS.has(path) || path.startsWith("/api/health")) return;

  const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
  if (!id) {
    const policy = await prisma.systemSettings.findUnique({where:{id:"global"},select:{requireWorkstationApproval:true}});
    if (request.headers.origin || policy?.requireWorkstationApproval) {
      return reply.status(403).send({ error: "workstation_identification_required", message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE });
    }
    return;
  }

  const workstation = await prisma.workstation.findUnique({ where: { id }, select: { active: true, allowOperational: true, allowBi: true, allowPriorities: true } });
  if (!workstation) {
    return reply.status(403).send({ error: "workstation_identification_required", message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE });
  }
  // Metadata remains available to explain restrictions. Admin recovery is narrowly scoped.
  if (path === "/api/modules/access" && request.method === "GET") return;
  if (isRecoveryRequest(request.method, path) && readAdminSession(request)) return;
  if (!workstation.active) {
    return reply.status(403).send({ error: "workstation_inactive", message: WORKSTATION_INACTIVE_MESSAGE });
  }
  const module = apiModule(path);
  if (module && !isModuleAllowed(module, workstation)) {
    return reply.status(403).send({ error: "module_forbidden", module, message: "Módulo não autorizado para esta workstation." });
  }
}
