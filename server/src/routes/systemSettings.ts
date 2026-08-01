import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { getSystemSettings, GLOBAL_SYSTEM_SETTINGS_ID } from "../services/systemSettings.js";
import { badRequest } from "./routeUtils.js";

type UpdateSystemSettingsBody = {
  allowWholeSetCalls?: unknown;
};

export function registerSystemSettingsRoutes(app: FastifyInstance) {
  app.get("/api/system-settings", async () => getSystemSettings());

  app.patch<{ Body: UpdateSystemSettingsBody }>("/api/system-settings", async (request, reply) => {
    const allowWholeSetCalls = request.body?.allowWholeSetCalls;

    if (typeof allowWholeSetCalls !== "boolean") {
      return badRequest(reply, "Campo allowWholeSetCalls deve ser booleano");
    }

    return prisma.systemSettings.upsert({
      where: { id: GLOBAL_SYSTEM_SETTINGS_ID },
      update: { allowWholeSetCalls },
      create: {
        id: GLOBAL_SYSTEM_SETTINGS_ID,
        allowWholeSetCalls,
      },
    });
  });
}
