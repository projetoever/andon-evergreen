import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import {
  hashCredential,
  normalizeCredential,
  normalizePin,
  normalizeTag,
} from "../security/technicianCredentials.js";
import {
  credentialBelongsToAnotherTechnician,
  identifyTechnician,
  technicianIdentitySelect,
  toPublicTechnician,
} from "../services/technicianIdentity.js";
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
  pin?: unknown;
  tag?: unknown;
};

type UpdateTechnicianBody = CreateTechnicianBody;

type IdentifyTechnicianBody = {
  method?: unknown;
  value?: unknown;
};

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

    const technicians = await prisma.technician.findMany({
      where,
      orderBy: { name: "asc" },
      select: technicianIdentitySelect,
    });

    return technicians.map(toPublicTechnician);
  });

  app.post<{ Body: IdentifyTechnicianBody }>("/api/technicians/identify", async (request, reply) => {
    const credential = normalizeCredential(request.body?.method, request.body?.value);
    if (!credential) {
      return badRequest(
        reply,
        request.body?.method === "pin"
          ? "PIN inválido. Use de 4 a 8 números"
          : "Código da tag inválido",
      );
    }

    const technician = await identifyTechnician(credential);
    if (!technician) return notFound(reply, "Credencial não reconhecida ou mantenedor inativo");

    return toPublicTechnician(technician);
  });

  app.post<{ Body: CreateTechnicianBody }>("/api/technicians", async (request, reply) => {
    const name = requiredString(request.body?.name);
    const technicalArea = requiredString(request.body?.technicalArea);
    const shiftId = requiredString(request.body?.shiftId);
    const parsedActive = parseBoolean(request.body?.active);
    const active = parsedActive ?? true;
    const pin = normalizePin(request.body?.pin);
    const tag = request.body && "tag" in request.body ? normalizeTag(request.body.tag) : null;

    if (!name) return badRequest(reply, "Informe o nome do manutentor");
    if (!technicalArea || !TECHNICAL_AREAS.has(technicalArea)) {
      return badRequest(reply, "Área técnica inválida");
    }
    if (!shiftId) return badRequest(reply, "Informe o turno do manutentor");
    if (!pin) return badRequest(reply, "Informe um PIN de 4 a 8 números");
    if (request.body && "tag" in request.body && request.body.tag && !tag) {
      return badRequest(reply, "Código da tag inválido");
    }
    if (request.body && "active" in request.body && parsedActive === undefined) {
      return badRequest(reply, "Status do manutentor inválido");
    }

    const [duplicate, hasShift, duplicatePin, duplicateTag] = await Promise.all([
      findDuplicateName(name),
      shiftExists(shiftId),
      credentialBelongsToAnotherTechnician({ method: "pin", value: pin }),
      tag
        ? credentialBelongsToAnotherTechnician({ method: "rfid", value: tag })
        : Promise.resolve(false),
    ]);

    if (duplicate) return badRequest(reply, "Já existe manutentor com este nome");
    if (!hasShift) return badRequest(reply, "Turno não encontrado");
    if (duplicatePin) return badRequest(reply, "Este PIN já pertence a outro manutentor");
    if (duplicateTag) return badRequest(reply, "Esta tag já pertence a outro manutentor");

    const [pinHash, tagHash] = await Promise.all([
      hashCredential(pin),
      tag ? hashCredential(tag) : Promise.resolve(null),
    ]);

    const technician = await prisma.technician.create({
      data: {
        name,
        technicalArea,
        shiftId,
        active,
        pinHash,
        tagHash,
      },
      select: technicianIdentitySelect,
    });

    return reply.status(201).send(toPublicTechnician(technician));
  });

  app.patch<{ Params: { id: string }; Body: UpdateTechnicianBody }>(
    "/api/technicians/:id",
    async (request, reply) => {
      const current = await prisma.technician.findUnique({
        where: { id: request.params.id },
        select: technicianIdentitySelect,
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
      const pinProvided = Boolean(request.body && "pin" in request.body);
      const pin = pinProvided ? normalizePin(request.body.pin) : null;
      const tagProvided = Boolean(request.body && "tag" in request.body);
      const shouldClearTag = tagProvided && (request.body.tag === null || request.body.tag === "");
      const tag = tagProvided && !shouldClearTag ? normalizeTag(request.body.tag) : null;

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
      if ((!current.pinHash && !pinProvided) || (pinProvided && !pin)) {
        return badRequest(reply, "Informe um PIN de 4 a 8 números");
      }
      if (tagProvided && !shouldClearTag && !tag) {
        return badRequest(reply, "Código da tag inválido");
      }

      if (name && (await findDuplicateName(name, current.id))) {
        return badRequest(reply, "Já existe manutentor com este nome");
      }
      if (shiftId && !(await shiftExists(shiftId))) {
        return badRequest(reply, "Turno não encontrado");
      }

      if (
        pin &&
        (await credentialBelongsToAnotherTechnician(
          { method: "pin", value: pin },
          current.id,
        ))
      ) {
        return badRequest(reply, "Este PIN já pertence a outro manutentor");
      }
      if (
        tag &&
        (await credentialBelongsToAnotherTechnician(
          { method: "rfid", value: tag },
          current.id,
        ))
      ) {
        return badRequest(reply, "Esta tag já pertence a outro manutentor");
      }

      const [pinHash, tagHash] = await Promise.all([
        pin ? hashCredential(pin) : Promise.resolve(undefined),
        tag ? hashCredential(tag) : Promise.resolve(undefined),
      ]);

      const technician = await prisma.technician.update({
        where: { id: current.id },
        data: {
          ...(name ? { name } : {}),
          ...(technicalArea ? { technicalArea } : {}),
          ...(shiftId ? { shiftId } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(pinHash ? { pinHash } : {}),
          ...(tagHash ? { tagHash } : {}),
          ...(shouldClearTag ? { tagHash: null } : {}),
        },
        select: technicianIdentitySelect,
      });

      return toPublicTechnician(technician);
    },
  );
}
