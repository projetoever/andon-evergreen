import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

const TECHNICAL_AREAS = new Set(["electrical", "mechanical", "hot_melt", "quality", "leadership"]);

type TechnicianQuery = {
  active?: string;
  technicalArea?: string;
  shiftId?: string;
};

type CreateTechnicianBody = {
  name?: unknown;
  technicalArea?: unknown;
  shiftId?: unknown;
  active?: unknown;
};

type UpdateTechnicianBody = CreateTechnicianBody;

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function findDuplicateName(name: string, excludedId?: string) {
  return prisma.technician.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });
}

async function shiftExists(shiftId: string) {
  return Boolean(
    await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { id: true },
    }),
  );
}

export async function registerTechnicianRoutes(app: FastifyInstance) {
  app.get<{ Querystring: TechnicianQuery }>("/api/technicians", async (request) => {
    const active = parseBoolean(request.query.active);
    const { technicalArea, shiftId } = request.query;
    const where: Prisma.TechnicianWhereInput = {
      ...(active !== undefined ? { active } : {}),
      ...(technicalArea ? { technicalArea } : {}),
      ...(shiftId ? { shiftId } : {}),
    };

    return prisma.technician.findMany({
      where,
      orderBy: { name: "asc" },
    });
  });

  app.post<{ Body: CreateTechnicianBody }>("/api/technicians", async (request, reply) => {
    const name = requiredString(request.body?.name);
    const technicalArea = requiredString(request.body?.technicalArea);
    const shiftId = requiredString(request.body?.shiftId);
    const parsedActive = parseBoolean(request.body?.active);
    const active = parsedActive ?? true;

    if (!name) return badRequest(reply, "Informe o nome do manutentor");
    if (!technicalArea || !TECHNICAL_AREAS.has(technicalArea)) {
      return badRequest(reply, "Área técnica inválida");
    }
    if (!shiftId) return badRequest(reply, "Informe o turno do manutentor");
    if (request.body && "active" in request.body && parsedActive === undefined) {
      return badRequest(reply, "Status do manutentor inválido");
    }

    const [duplicate, hasShift] = await Promise.all([
      findDuplicateName(name),
      shiftExists(shiftId),
    ]);

    if (duplicate) return badRequest(reply, "Já existe manutentor com este nome");
    if (!hasShift) return badRequest(reply, "Turno não encontrado");

    const technician = await prisma.technician.create({
      data: {
        name,
        technicalArea,
        shiftId,
        active,
      },
    });

    return reply.status(201).send(technician);
  });

  app.patch<{ Params: { id: string }; Body: UpdateTechnicianBody }>(
    "/api/technicians/:id",
    async (request, reply) => {
      const current = await prisma.technician.findUnique({
        where: { id: request.params.id },
      });

      if (!current) return notFound(reply, "Manutentor não encontrado");

      const name =
        request.body && "name" in request.body ? requiredString(request.body.name) : undefined;
      const technicalArea =
        request.body && "technicalArea" in request.body
          ? requiredString(request.body.technicalArea)
          : undefined;
      const shiftId =
        request.body && "shiftId" in request.body
          ? requiredString(request.body.shiftId)
          : undefined;
      const active =
        request.body && "active" in request.body ? parseBoolean(request.body.active) : undefined;

      if (request.body && "name" in request.body && !name) {
        return badRequest(reply, "Informe o nome do manutentor");
      }
      if (
        request.body &&
        "technicalArea" in request.body &&
        (!technicalArea || !TECHNICAL_AREAS.has(technicalArea))
      ) {
        return badRequest(reply, "Área técnica inválida");
      }
      if (request.body && "shiftId" in request.body && !shiftId) {
        return badRequest(reply, "Informe o turno do manutentor");
      }
      if (request.body && "active" in request.body && active === undefined) {
        return badRequest(reply, "Status do manutentor inválido");
      }

      if (name && (await findDuplicateName(name, current.id))) {
        return badRequest(reply, "Já existe manutentor com este nome");
      }
      if (shiftId && !(await shiftExists(shiftId))) {
        return badRequest(reply, "Turno não encontrado");
      }

      return prisma.technician.update({
        where: { id: current.id },
        data: {
          ...(name ? { name } : {}),
          ...(technicalArea ? { technicalArea } : {}),
          ...(shiftId ? { shiftId } : {}),
          ...(active !== undefined ? { active } : {}),
        },
      });
    },
  );
}
