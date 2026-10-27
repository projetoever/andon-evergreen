import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { GLOBAL_SYSTEM_SETTINGS_ID } from "../services/systemSettings.js";
import { MODULE_REGISTRY, isModuleAllowed } from "../services/moduleRegistry.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { badRequest } from "./routeUtils.js";
import { hasModuleSession, isPasswordModule } from "../security/moduleAuthorization.js";
import type { TLSSocket } from "node:tls";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { resolveSession } from "../access/sessions.js";
import { assertModule, type Principal } from "../access/policy.js";

export async function registerModuleRoutes(app: FastifyInstance) {
  app.get("/api/modules/access", async (request, reply) => {
    const central = centralAccessEnabled();
    if (central) {
      const origin = process.env.ANDON_ACCESS_ORIGIN ?? "";
      if (!(request.raw.socket as TLSSocket).encrypted || !origin.startsWith("https://"))
        return reply.status(426).send({ error: "https_required" });
      if (request.headers.origin !== origin)
        return reply.status(403).send({ error: "origin_denied" });
    }
    const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
    const workstation = id
      ? await prisma.workstation.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            active: true,
            pendingApproval: true,
            allowOperational: true,
            allowBi: true,
            allowPriorities: true,
            lockedMachineId: true,
            admission: {
              select: { status: true, requestedAt: true, decisionReason: true },
            },
          },
        })
      : null;
    if (!workstation)
      return reply.status(403).send({
        error: "workstation_identification_required",
        message: "Registre a workstation antes de consultar os módulos.",
      });
    const settings = await prisma.systemSettings.findUnique({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      select: { hubEnabled: true },
    });
    const [credentials, priority] = await Promise.all([
      prisma.moduleCredential.findMany({
        select: { id: true, passwordRequired: true, credentialVersion: true },
      }),
      prisma.dashboardPriorityConfig.findUnique({
        where: { id: "global" },
        select: { passwordRequired: true },
      }),
    ]);
    let principal: Principal | null = null;
    if (central) {
      try {
        principal = await resolveSession(
          prisma,
          {
            token: readSecureCookie(request, ACCESS_COOKIE),
            workstationId: workstation.id,
          },
          new Date(),
          true,
        );
      } catch {
        principal = null;
      }
    }
    const permitted = (module: (typeof MODULE_REGISTRY)[number]) => {
      if (
        !workstation.active ||
        workstation.pendingApproval ||
        !isModuleAllowed(module.id, workstation)
      )
        return false;
      if (!central) return true;
      if (!principal || principal.purpose !== "normal") return false;
      if (principal.machineScope !== "all" && principal.machineIds.length === 0) return false;
      try {
        assertModule(principal, workstation, module.id);
        return true;
      } catch {
        return false;
      }
    };
    return {
      hubEnabled: settings?.hubEnabled ?? false,
      workstation,
      centralAccessEnabled: central,
      principal: principal
        ? {
            userId: principal.userId,
            login: principal.login,
            displayName: principal.displayName,
            roleLabel: principal.roleLabel,
            purpose: principal.purpose,
            machineScope: principal.machineScope,
            machineIds: principal.machineIds,
          }
        : null,
      modules: MODULE_REGISTRY.map((module) => {
        const policy = credentials.find((item) => item.id === module.id) ?? {
          passwordRequired: false,
          credentialVersion: 0,
        };
        return {
          ...module,
          allowed: permitted(module),
          passwordRequired: isPasswordModule(module.id)
            ? policy.passwordRequired
            : (priority?.passwordRequired ?? true),
          authenticated: isPasswordModule(module.id)
            ? hasModuleSession(request, module.id, policy)
            : false,
        };
      }),
    };
  });

  app.get("/api/modules/settings", async () => {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      select: { hubEnabled: true, requireWorkstationApproval: true },
    });
    return {
      hubEnabled: settings?.hubEnabled ?? false,
      requireWorkstationApproval: settings?.requireWorkstationApproval ?? false,
    };
  });

  app.patch<{ Body: { hubEnabled?: unknown; requireWorkstationApproval?: unknown } }>(
    "/api/modules/settings",
    async (request, reply) => {
      const body = request.body ?? {};
      const hasHub = Object.hasOwn(body, "hubEnabled");
      const hasApproval = Object.hasOwn(body, "requireWorkstationApproval");
      if (
        (!hasHub && !hasApproval) ||
        (hasHub && typeof body.hubEnabled !== "boolean") ||
        (hasApproval && typeof body.requireWorkstationApproval !== "boolean")
      )
        return badRequest(reply, "Informe uma configuração booleana válida do Hub");
      const patch = {
        ...(hasHub ? { hubEnabled: body.hubEnabled as boolean } : {}),
        ...(hasApproval
          ? { requireWorkstationApproval: body.requireWorkstationApproval as boolean }
          : {}),
      };
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('andon-enrollment-policy'))::text`;
        return tx.systemSettings.upsert({
          where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
          create: { id: GLOBAL_SYSTEM_SETTINGS_ID, ...patch },
          update: patch,
          select: { hubEnabled: true, requireWorkstationApproval: true },
        });
      });
    },
  );
}
