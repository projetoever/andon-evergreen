import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import { ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { AccessError } from "../access/policy.js";
import { runCentralVisualPaletteUpdate } from "../access/centralVisualPalette.js";
import { isAuthorizedCentralVisualPalette } from "../security/centralVisualPaletteHttp.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

/** Dedicated opt-in mutation. Palette reads use the existing guarded settings GET. */
export function registerVisualPaletteRoutes(app: FastifyInstance) {
  app.patch<{ Body: unknown }>("/api/andon-visual-palette", async (request, reply) => {
    if (!isAuthorizedCentralVisualPalette(request))
      throw new AccessError("central_action_not_supported");
    try {
      return await runCentralVisualPaletteUpdate(prisma, {
        token: readSecureCookie(request, ACCESS_COOKIE),
        workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
        body: request.body,
        requestId: request.id,
        ipAddress: request.ip.replace(/^::ffff:/, ""),
      });
    } catch (error) {
      if (error instanceof AccessError)
        return reply.status(error.statusCode).send({ error: error.code });
      throw error;
    }
  });
}
