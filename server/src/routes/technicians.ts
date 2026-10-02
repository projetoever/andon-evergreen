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
  lockTechnicianCredential,
  technicianIdentitySelect,
  toPublicTechnician,
} from "../services/technicianIdentity.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

type TechnicianQuery = {
  active?: string;
  technicalArea?: string;
  shiftId?: string;
};

type CreateTechnicianBody = {
  name?: unknown;
  employeeId?: unknown;
  technicalArea?: unknown;
  technicalAreas?: unknown;
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

class TechnicianCredentialConflictError extends Error {}
class TechnicianAreaValidationError extends Error {}

function duplicateCredentialMessage(method: "pin" | "rfid") {
  return method === "pin"
    ? "Este PIN já está cadastrado para outro mantenedor. Informe um PIN diferente"
    : "Esta tag já está cadastrada para outro mantenedor. Informe outra tag";
}

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeEmployeeId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized || undefined;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
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

async function findDuplicateEmployeeId(employeeId: string, excludedId?: string) {
  return prisma.technician.findFirst({
    where: {
      employeeId: { equals: employeeId, mode: "insensitive" },
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

function parseTechnicalAreas(value: unknown) {
  if (!Array.isArray(value)) {
    throw new TechnicianAreaValidationError("Informe uma lista válida de áreas técnicas");
  }

  const technicalAreas = value.map(requiredString);
  if (!technicalAreas.length || technicalAreas.some((area) => !area)) {
    throw new TechnicianAreaValidationError("Informe pelo menos uma área técnica");
  }

  const normalizedAreas = technicalAreas as string[];
  if (new Set(normalizedAreas).size !== normalizedAreas.length) {
    throw new TechnicianAreaValidationError("Não repita áreas técnicas no cadastro");
  }

  return normalizedAreas;
}

async function validateTechnicalAreas(
  client: Pick<Prisma.TransactionClient, "andonCategory">,
  technicalAreas: string[],
  existingAreas = new Set<string>(),
) {
  const categories = await client.andonCategory.findMany({
    where: { id: { in: technicalAreas } },
    select: { id: true, categoryGroup: true, active: true },
  });
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  for (const technicalArea of technicalAreas) {
    const category = categoriesById.get(technicalArea);
    if (!category || category.categoryGroup !== "maintenance") {
      throw new TechnicianAreaValidationError("Área técnica inválida");
    }
    if (!category.active && !existingAreas.has(technicalArea)) {
      throw new TechnicianAreaValidationError("Não é possível adicionar uma área técnica inativa");
    }
  }
}

function effectiveCurrentAreas(current: {
  technicalArea: string | null;
  technicalAreas: Array<{ technicalArea: string }>;
}) {
  const configured = current.technicalAreas.map((item) => item.technicalArea);
  return configured.length ? configured : current.technicalArea ? [current.technicalArea] : [];
}

function resolveLegacyTechnicalArea(currentArea: string | null, technicalAreas: string[]) {
  return currentArea && technicalAreas.includes(currentArea) ? currentArea : technicalAreas[0];
}

export async function registerTechnicianRoutes(app: FastifyInstance) {
  app.get<{ Querystring: TechnicianQuery }>("/api/technicians", async (request) => {
    const active = parseBoolean(request.query.active);
    const { technicalArea, shiftId } = request.query;
    const where: Prisma.TechnicianWhereInput = {
      ...(active !== undefined ? { active } : {}),
      ...(technicalArea
        ? {
            OR: [{ technicalArea }, { technicalAreas: { some: { technicalArea } } }],
          }
        : {}),
      ...(shiftId ? { shiftId } : {}),
    };

    const technicians = await prisma.technician.findMany({
      where,
      orderBy: { name: "asc" },
      select: technicianIdentitySelect,
    });

    return technicians.map(toPublicTechnician);
  });

  app.post<{ Body: IdentifyTechnicianBody }>(
    "/api/technicians/identify",
    async (request, reply) => {
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
    },
  );

  app.post<{ Body: CreateTechnicianBody }>("/api/technicians", async (request, reply) => {
    const name = requiredString(request.body?.name);
    const employeeId = normalizeEmployeeId(request.body?.employeeId);
    const technicalArea = requiredString(request.body?.technicalArea);
    let technicalAreas: string[];
    try {
      technicalAreas =
        request.body && "technicalAreas" in request.body
          ? parseTechnicalAreas(request.body.technicalAreas)
          : technicalArea
            ? [technicalArea]
            : [];
    } catch (error) {
      if (error instanceof TechnicianAreaValidationError) {
        return badRequest(reply, error.message);
      }
      throw error;
    }
    const shiftId = requiredString(request.body?.shiftId);
    const parsedActive = parseBoolean(request.body?.active);
    const active = parsedActive ?? true;
    const pin = normalizePin(request.body?.pin);
    const tag = request.body && "tag" in request.body ? normalizeTag(request.body.tag) : null;

    if (!name) return badRequest(reply, "Informe o nome do manutentor");
    if (!employeeId) return badRequest(reply, "Informe o ID do colaborador");
    if (!technicalAreas.length) return badRequest(reply, "Informe pelo menos uma área técnica");
    if (!shiftId) return badRequest(reply, "Informe o turno do manutentor");
    if (!pin) return badRequest(reply, "Informe um PIN de 4 a 8 números");
    if (request.body && "tag" in request.body && request.body.tag && !tag) {
      return badRequest(reply, "Código da tag inválido");
    }
    if (request.body && "active" in request.body && parsedActive === undefined) {
      return badRequest(reply, "Status do manutentor inválido");
    }

    const [duplicate, duplicateEmployeeId, hasShift] = await Promise.all([
      findDuplicateName(name),
      findDuplicateEmployeeId(employeeId),
      shiftExists(shiftId),
    ]);

    if (duplicate) return badRequest(reply, "Já existe manutentor com este nome");
    if (duplicateEmployeeId) {
      return badRequest(reply, "Este ID do colaborador já está cadastrado para outro mantenedor");
    }
    if (!hasShift) return badRequest(reply, "Turno não encontrado");

    const [pinHash, tagHash] = await Promise.all([
      hashCredential(pin),
      tag ? hashCredential(tag) : Promise.resolve(null),
    ]);

    try {
      const technician = await prisma.$transaction(
        async (tx) => {
          await validateTechnicalAreas(tx, technicalAreas);
          await lockTechnicianCredential(tx, { method: "pin", value: pin });

          if (tag) {
            await lockTechnicianCredential(tx, { method: "rfid", value: tag });
          }

          if (
            await credentialBelongsToAnotherTechnician({ method: "pin", value: pin }, undefined, tx)
          ) {
            throw new TechnicianCredentialConflictError(duplicateCredentialMessage("pin"));
          }

          if (
            tag &&
            (await credentialBelongsToAnotherTechnician(
              { method: "rfid", value: tag },
              undefined,
              tx,
            ))
          ) {
            throw new TechnicianCredentialConflictError(duplicateCredentialMessage("rfid"));
          }

          return tx.technician.create({
            data: {
              name,
              employeeId,
              technicalArea: technicalAreas[0],
              technicalAreas: {
                create: technicalAreas.map((area) => ({ technicalArea: area })),
              },
              shiftId,
              active,
              pinHash,
              tagHash,
            },
            select: technicianIdentitySelect,
          });
        },
        { timeout: 30_000 },
      );

      return reply.status(201).send(toPublicTechnician(technician));
    } catch (error) {
      if (error instanceof TechnicianCredentialConflictError) {
        return badRequest(reply, error.message);
      }
      if (error instanceof TechnicianAreaValidationError) {
        return badRequest(reply, error.message);
      }
      if (isUniqueConstraintError(error)) {
        return badRequest(reply, "Este ID do colaborador já está cadastrado para outro mantenedor");
      }

      throw error;
    }
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
      const employeeIdProvided = Boolean(request.body && "employeeId" in request.body);
      const employeeId = employeeIdProvided
        ? normalizeEmployeeId(request.body?.employeeId)
        : undefined;
      const technicalArea =
        request.body && "technicalArea" in request.body
          ? requiredString(request.body.technicalArea)
          : undefined;
      const technicalAreasProvided = Boolean(request.body && "technicalAreas" in request.body);
      const technicalAreaProvided = Boolean(request.body && "technicalArea" in request.body);
      let requestedTechnicalAreas: string[] | undefined;
      try {
        requestedTechnicalAreas = technicalAreasProvided
          ? parseTechnicalAreas(request.body?.technicalAreas)
          : technicalAreaProvided
            ? technicalArea
              ? [technicalArea]
              : []
            : undefined;
      } catch (error) {
        if (error instanceof TechnicianAreaValidationError) {
          return badRequest(reply, error.message);
        }
        throw error;
      }
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
      if (employeeIdProvided && !employeeId) {
        return badRequest(reply, "Informe o ID do colaborador");
      }
      const relevantUpdateFields = [
        "name",
        "technicalArea",
        "technicalAreas",
        "shiftId",
        "active",
        "pin",
        "tag",
      ].some((field) => Boolean(request.body && field in request.body));
      if (!current.employeeId && relevantUpdateFields && !employeeId) {
        return badRequest(reply, "Informe o ID do colaborador para atualizar este mantenedor");
      }
      if (requestedTechnicalAreas && !requestedTechnicalAreas.length) {
        return badRequest(reply, "Informe pelo menos uma área técnica");
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
      if (employeeId && (await findDuplicateEmployeeId(employeeId, current.id))) {
        return badRequest(reply, "Este ID do colaborador já está cadastrado para outro mantenedor");
      }
      if (shiftId && !(await shiftExists(shiftId))) {
        return badRequest(reply, "Turno não encontrado");
      }

      const [pinHash, tagHash] = await Promise.all([
        pin ? hashCredential(pin) : Promise.resolve(undefined),
        tag ? hashCredential(tag) : Promise.resolve(undefined),
      ]);

      try {
        const technician = await prisma.$transaction(
          async (tx) => {
            if (requestedTechnicalAreas) {
              await validateTechnicalAreas(
                tx,
                requestedTechnicalAreas,
                new Set(effectiveCurrentAreas(current)),
              );
            }

            if (pin) {
              await lockTechnicianCredential(tx, { method: "pin", value: pin });
            }

            if (tag) {
              await lockTechnicianCredential(tx, { method: "rfid", value: tag });
            }

            if (
              pin &&
              (await credentialBelongsToAnotherTechnician(
                { method: "pin", value: pin },
                current.id,
                tx,
              ))
            ) {
              throw new TechnicianCredentialConflictError(duplicateCredentialMessage("pin"));
            }

            if (
              tag &&
              (await credentialBelongsToAnotherTechnician(
                { method: "rfid", value: tag },
                current.id,
                tx,
              ))
            ) {
              throw new TechnicianCredentialConflictError(duplicateCredentialMessage("rfid"));
            }

            return tx.technician.update({
              where: { id: current.id },
              data: {
                ...(name ? { name } : {}),
                ...(employeeId ? { employeeId } : {}),
                ...(requestedTechnicalAreas
                  ? {
                      technicalArea: resolveLegacyTechnicalArea(
                        current.technicalArea,
                        requestedTechnicalAreas,
                      ),
                      technicalAreas: {
                        deleteMany: {},
                        create: requestedTechnicalAreas.map((area) => ({ technicalArea: area })),
                      },
                    }
                  : {}),
                ...(shiftId ? { shiftId } : {}),
                ...(active !== undefined ? { active } : {}),
                ...(pinHash ? { pinHash } : {}),
                ...(tagHash ? { tagHash } : {}),
                ...(shouldClearTag ? { tagHash: null } : {}),
              },
              select: technicianIdentitySelect,
            });
          },
          { timeout: 30_000 },
        );

        return toPublicTechnician(technician);
      } catch (error) {
        if (error instanceof TechnicianCredentialConflictError) {
          return badRequest(reply, error.message);
        }
        if (error instanceof TechnicianAreaValidationError) {
          return badRequest(reply, error.message);
        }
        if (isUniqueConstraintError(error)) {
          return badRequest(
            reply,
            "Este ID do colaborador já está cadastrado para outro mantenedor",
          );
        }

        throw error;
      }
    },
  );
}
