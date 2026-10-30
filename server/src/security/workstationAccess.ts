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
import { markCentralClassificationAuthorized, isCentralClassificationMutation } from "./centralClassificationHttp.js";
import { markCentralAttendanceAuthorized, isCentralAttendanceMutation } from "./centralAttendanceHttp.js";
import { isCentralPriorityWrite, markCentralPriorityAuthorized } from "./centralPriorityHttp.js";
import { isCentralMaintenanceCompletionMutation, markCentralMaintenanceCompletionAuthorized } from "./centralMaintenanceCompletionHttp.js";
import { isCentralReturnToMaintenanceMutation, markCentralReturnToMaintenanceAuthorized } from "./centralReturnToMaintenanceHttp.js";
import { isCentralOpenCallMutation, markCentralOpenCallAuthorized } from "./centralOpenCallHttp.js";
import { isCentralBatchOpenMutation, markCentralBatchOpenAuthorized } from "./centralBatchOpenHttp.js";
import { isCentralFinishCallMutation, markCentralFinishCallAuthorized } from "./centralFinishCallHttp.js";
import { isCentralCancelCallMutation, markCentralCancelCallAuthorized } from "./centralCancelCallHttp.js";
import { isCentralTechnicianEndMutation, markCentralTechnicianEndAuthorized } from "./centralTechnicianEndHttp.js";
import { isCentralTechnicianAddMutation, markCentralTechnicianAddAuthorized } from "./centralTechnicianAddHttp.js";
import { isCentralOwnWorkstationPreference, markCentralOwnWorkstationPreferenceAuthorized, centralOwnWorkstationPreferenceReadTarget, centralOwnWorkstationPreferencesEnabled } from "./centralOwnWorkstationPrefsHttp.js";

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
      const ownPreferencesReadTarget = centralOwnWorkstationPreferenceReadTarget(request.method, path);
      if (ownPreferencesReadTarget) {
        if (!centralOwnWorkstationPreferencesEnabled() ||
            ownPreferencesReadTarget !== principal.workstationId)
          throw new AccessError("workstation_scope_denied");
        assertModule(principal, workstation, "operational");
        return;
      }
      // Only the machine GET handlers currently implement database-enforced
      // selected-machine filtering. Other restricted reads still fail closed.
      if (principal.machineScope !== "all" && !isScopedMachineReadRoute(request.method, path) &&
          !isCentralAttendanceMutation(request.method, path) &&
          !isCentralMaintenanceCompletionMutation(request.method, path) &&
          !isCentralReturnToMaintenanceMutation(request.method, path) &&
          !isCentralOpenCallMutation(request.method, path) &&
          !isCentralBatchOpenMutation(request.method, path) &&
          !isCentralFinishCallMutation(request.method, path) &&
          !isCentralCancelCallMutation(request.method, path) &&
          !isCentralTechnicianEndMutation(request.method, path) &&
          !isCentralTechnicianAddMutation(request.method, path) &&
          !isCentralOwnWorkstationPreference(request.method, path))
        throw new AccessError("scoped_query_required");
      // SEC-04: one narrowly scoped opt-in route family, never a generic
      // central-write bypass. The marker requires HTTPS/session/CSRF/ACL and
      // the domain adapter revalidates every grant under transactional locks.
      // All other writes still fail closed, including calls and Priorities.
      if (!["GET", "HEAD"].includes(request.method)) {
        if (isCentralClassificationMutation(request.method, path)) {
          markCentralClassificationAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralAttendanceMutation(request.method, path)) {
          markCentralAttendanceAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralMaintenanceCompletionMutation(request.method, path)) {
          markCentralMaintenanceCompletionAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralReturnToMaintenanceMutation(request.method, path)) {
          markCentralReturnToMaintenanceAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralOpenCallMutation(request.method, path)) {
          markCentralOpenCallAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralBatchOpenMutation(request.method, path)) {
          markCentralBatchOpenAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralFinishCallMutation(request.method, path)) {
          markCentralFinishCallAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralCancelCallMutation(request.method, path)) {
          markCentralCancelCallAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralTechnicianEndMutation(request.method, path)) {
          markCentralTechnicianEndAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralTechnicianAddMutation(request.method, path)) {
          markCentralTechnicianAddAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralOwnWorkstationPreference(request.method, path)) {
          markCentralOwnWorkstationPreferenceAuthorized(request, principal, workstation);
          return;
        }
        if (isCentralPriorityWrite(request.method, path)) {
          markCentralPriorityAuthorized(request, principal, workstation);
          return;
        }
        throw new AccessError("central_action_not_supported");
      }
      if (!module) throw new AccessError("central_route_not_supported");
      assertModule(principal, workstation, module);
      // Historical interventions require an additional permission even for
      // users who can see the live operational module.
      if (["GET", "HEAD"].includes(request.method) &&
          (path === "/api/andon-calls/history" ||
           path === "/api/analytics/data-quality-details")) {
        // Data-quality detail rows contain diagnoses, work orders, and names;
        // BI dashboard permission alone must not unlock that historical PII.
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
