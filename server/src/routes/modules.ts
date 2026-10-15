import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { GLOBAL_SYSTEM_SETTINGS_ID } from "../services/systemSettings.js";
import { MODULE_REGISTRY, isModuleAllowed } from "../services/moduleRegistry.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { badRequest } from "./routeUtils.js";
import { hasModuleSession, isPasswordModule } from "../security/moduleAuthorization.js";

export async function registerModuleRoutes(app: FastifyInstance) {
  app.get("/api/modules/access", async (request, reply) => {
    const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
    const workstation = id
      ? await prisma.workstation.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            active: true,
            allowOperational: true,
            allowBi: true,
            allowPriorities: true,
            lockedMachineId: true,
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
    return {
      hubEnabled: settings?.hubEnabled ?? false,
      workstation,
      modules: MODULE_REGISTRY.map((module) => {
        const policy = credentials.find((item) => item.id === module.id) ?? {
          passwordRequired: false,
          credentialVersion: 0,
        };
        return {
          ...module,
          allowed: workstation.active && isModuleAllowed(module.id, workstation),
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
      select: { hubEnabled: true },
    });
    return { hubEnabled: settings?.hubEnabled ?? false };
  });

  app.patch<{ Body: { hubEnabled?: unknown } }>("/api/modules/settings", async (request, reply) => {
    if (typeof request.body?.hubEnabled !== "boolean")
      return badRequest(reply, "Campo hubEnabled deve ser booleano");
    return prisma.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      create: { id: GLOBAL_SYSTEM_SETTINGS_ID, hubEnabled: request.body.hubEnabled },
      update: { hubEnabled: request.body.hubEnabled },
      select: { hubEnabled: true },
    });
  });
}
