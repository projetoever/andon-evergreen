import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

type ShiftBody = {
  name?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  active?: unknown;
};

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

export async function registerShiftRoutes(app: FastifyInstance) {
  app.get("/api/shifts", async () =>
    prisma.shift.findMany({
      orderBy: { name: "asc" },
    }),
  );

  app.patch<{ Params: { id: string }; Body: ShiftBody }>(
    "/api/shifts/:id",
    async (request, reply) => {
      const current = await prisma.shift.findUnique({
        where: { id: request.params.id },
      });
      if (!current) return notFound(reply, "Turno não encontrado");

      const body = request.body ?? {};
      const name = "name" in body ? optionalText(body.name) : undefined;
      const startTime = "startTime" in body ? optionalText(body.startTime) : undefined;
      const endTime = "endTime" in body ? optionalText(body.endTime) : undefined;
      const active = "active" in body ? parseBoolean(body.active) : undefined;

      if ("name" in body && (!name || name.length > 80)) {
        return badRequest(reply, "Informe um nome de turno com até 80 caracteres");
      }
      if ("startTime" in body && (!startTime || !TIME_PATTERN.test(startTime))) {
        return badRequest(reply, "Horário inicial inválido");
      }
      if ("endTime" in body && (!endTime || !TIME_PATTERN.test(endTime))) {
        return badRequest(reply, "Horário final inválido");
      }
      if ("active" in body && active === undefined) {
        return badRequest(reply, "Status do turno inválido");
      }

      return prisma.shift.update({
        where: { id: current.id },
        data: {
          ...(name ? { name } : {}),
          ...(startTime ? { startTime } : {}),
          ...(endTime ? { endTime } : {}),
          ...(active !== undefined ? { active } : {}),
        },
      });
    },
  );
}
