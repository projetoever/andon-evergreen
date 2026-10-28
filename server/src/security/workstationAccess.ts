import type { FastifyReply, FastifyRequest } from "fastify";

import { prisma } from "../db/prisma.js";
import { readAdminSession } from "./adminAuthorization.js";
import { apiModule, isModuleAllowed, isRecoveryRequest } from "../services/moduleRegistry.js";
import {
  parseWorkstationId,
  WORKSTATION_INACTIVE_MESSAGE,
  WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
} from "../services/workstationAuthorization.js";
import { centralAccessEnabled, ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { resolveSession } from "../access/sessions.js";
import { AccessError, assertModule, assertPermission } from "../access/policy.js";
import {
  bindAuthorizedMachineReadPrincipal,
  isScopedMachineReadRoute,
} from "./centralScopedMachineReads.js";
import type { TLSSocket } from "node:tls";
import { authorizeIndustrialService } from "./industrialServiceAuthorization.js";

const ALLOWED_API_PATHS = new Set([
  "/api/workstations/register",
  "/api/admin-auth/login",
  "/api/admin-auth/recover",
  "/api/admin-auth/status",
  "/api/service-auth/token",
]);

/** Prevent a blocked workstation from interacting with the operational API.
 * Integrations without Origin/UUID remain compatible when mandatory approval is off.
 * Workstation UUIDs identify browsers, not immutable hardware identities.
 */
export async function enforceWorkstationAccess(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === "OPTIONS") return;
  const path = request.url.split("?", 1)[0] ?? "";
  if (!path.startsWith("/api/") || ALLOWED_API_PATHS.has(path) || path.startsWith("/api/health"))
    return;
  // The access subsystem performs its own stricter HTTPS, origin, CSRF and workstation checks.
  if (path.startsWith("/api/access/")) return;
  const central = centralAccessEnabled();
  if (central && (await authorizeIndustrialService(request, reply))) return;
  if (request.industrialService) return;

  const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
  if (!id) {
    if (central) {
      return reply.status(403).send({
        error: "workstation_identification_required",
        message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
      });
    }
    const policy = await prisma.systemSettings.findUnique({
      where: { id: "global" },
      select: { requireWorkstationApproval: true },
    });
    if (request.headers.origin || policy?.requireWorkstationApproval) {
      return reply.status(403).send({
        error: "workstation_identification_required",
        message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
      });
    }
    return;
  }

  const workstation = await prisma.workstation.findUnique({
    where: { id },
    select: { active: true, allowOperational: true, allowBi: true, allowPriorities: true },
  });
  if (!workstation) {
    return reply.status(403).send({
      error: "workstation_identification_required",
      message: WORKSTATION_IDENTIFICATION_REQUIRED_MESSAGE,
    });
  }
  // Metadata remains available to explain restrictions. Admin recovery is narrowly scoped.
  if (path === "/api/modules/access" && request.method === "GET") return;
  if (!central && isRecoveryRequest(request.method, path) && readAdminSession(request)) return;
  if (!workstation.active) {
    return reply
      .status(403)
      .send({ error: "workstation_inactive", message: WORKSTATION_INACTIVE_MESSAGE });
  }
  const module = apiModule(path);
  if (module && !isModuleAllowed(module, workstation)) {
    return reply.status(403).send({
      error: "module_forbidden",
      module,
      message: "Módulo não autorizado para esta workstation.",
    });
  }
  if (central) {
    const origin = process.env.ANDON_ACCESS_ORIGIN ?? "";
    if (!(request.raw.socket as TLSSocket).encrypted || !origin.startsWith("https://"))
      return reply.status(426).send({ error: "https_required" });
    if (request.headers.origin !== origin)
      return reply.status(403).send({ error: "origin_denied" });
    try {
      const principal = await resolveSession(prisma, {
        token: readSecureCookie(request, ACCESS_COOKIE),
        workstationId: id,
      });
      // Only the machine GET handlers currently implement database-enforced
      // selected-machine filtering. Other restricted reads still fail closed.
      if (principal.machineScope !== "all" && !isScopedMachineReadRoute(request.method, path))
        throw new AccessError("scoped_query_required");
      // Mutations are still denied pending validated route/action permission maps.
      if (!["GET", "HEAD"].includes(request.method))
        throw new AccessError("central_action_not_supported");
      if (!module) throw new AccessError("central_route_not_supported");
      assertModule(principal, workstation, module);
      // Historical interventions require an additional permission even for
      // users who can see the live operational module.
      if (request.method === "GET" && path === "/api/andon-calls/history") {
        assertPermission(principal, "history.read");
      }
      if (isScopedMachineReadRoute(request.method, path)) {
        bindAuthorizedMachineReadPrincipal(request, principal);
      }
    } catch (error) {
      const accessError = error instanceof AccessError ? error : null;
      return reply
        .status(accessError?.statusCode ?? 403)
        .send({ error: accessError?.code ?? "permission_denied" });
    }
  }
}
