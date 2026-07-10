import type { FastifyInstance, FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

type CatalogQuery = {
  includeInactive?: string;
};

type CatalogBody = {
  code?: unknown;
  name?: unknown;
  description?: unknown;
  isActive?: unknown;
  displayOrder?: unknown;
};

type CatalogRow = {
  createdAt: Date;
  updatedAt: Date;
};

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string"
    ? value.trim() || null
    : undefined;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDisplayOrder(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isInteger(numeric) || numeric < 0) {
    return undefined;
  }

  return numeric;
}

function serializeCatalog<T extends CatalogRow>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function invalidBoolean(
  reply: FastifyReply,
  value: unknown,
  fieldName: string,
) {
  if (
    value !== undefined &&
    parseBoolean(value) === undefined
  ) {
    return badRequest(
      reply,
      `Campo ${fieldName} deve ser true ou false`,
    );
  }

  return null;
}

export async function registerMachineCatalogRoutes(
  app: FastifyInstance,
) {
  app.get<{ Querystring: CatalogQuery }>(
    "/api/machine-set-types",
    async (request) => {
      const includeInactive =
        parseBoolean(request.query.includeInactive) === true;

      const rows = await prisma.machineSetType.findMany({
        where: includeInactive
          ? undefined
          : { isActive: true },
        orderBy: [
          { displayOrder: "asc" },
          { name: "asc" },
        ],
      });

      return rows.map(serializeCatalog);
    },
  );

  app.post<{ Body: CatalogBody }>(
    "/api/machine-set-types",
    async (request, reply) => {
      const name = requiredString(request.body?.name);

      if (!name) {
        return badRequest(reply, "Campo name é obrigatório");
      }

      const code = normalizeCode(
        requiredString(request.body?.code) ?? name,
      );

      if (!code) {
        return badRequest(reply, "Campo code é inválido");
      }

      const booleanError = invalidBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const displayOrder = parseDisplayOrder(
        request.body?.displayOrder,
      );

      if (
        request.body?.displayOrder !== undefined &&
        displayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero",
        );
      }

      try {
        const created = await prisma.machineSetType.create({
          data: {
            code,
            name,
            description: optionalString(
              request.body?.description,
            ),
            isActive:
              parseBoolean(request.body?.isActive) ?? true,
            displayOrder: displayOrder ?? 0,
          },
        });

        return reply
          .status(201)
          .send(serializeCatalog(created));
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return badRequest(
            reply,
            "Já existe um tipo de conjunto com esse código",
          );
        }

        throw error;
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: CatalogBody;
  }>(
    "/api/machine-set-types/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSetType.findUnique({
          where: { id: request.params.id },
        });

      if (!current) {
        return notFound(
          reply,
          "Tipo de conjunto não encontrado",
        );
      }

      const nextName =
        request.body?.name === undefined
          ? current.name
          : requiredString(request.body.name);

      if (!nextName) {
        return badRequest(reply, "Campo name é inválido");
      }

      const nextCode =
        request.body?.code === undefined
          ? current.code
          : normalizeCode(
              requiredString(request.body.code) ?? "",
            );

      if (!nextCode) {
        return badRequest(reply, "Campo code é inválido");
      }

      const booleanError = invalidBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const parsedDisplayOrder = parseDisplayOrder(
        request.body?.displayOrder,
      );

      if (
        request.body?.displayOrder !== undefined &&
        parsedDisplayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero",
        );
      }

      try {
        const updated =
          await prisma.machineSetType.update({
            where: { id: request.params.id },
            data: {
              code: nextCode,
              name: nextName,
              description:
                request.body?.description === undefined
                  ? current.description
                  : optionalString(
                      request.body.description,
                    ),
              isActive:
                request.body?.isActive === undefined
                  ? current.isActive
                  : parseBoolean(
                      request.body.isActive,
                    ),
              displayOrder:
                request.body?.displayOrder === undefined
                  ? current.displayOrder
                  : parsedDisplayOrder,
            },
          });

        return serializeCatalog(updated);
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return badRequest(
            reply,
            "Já existe um tipo de conjunto com esse código",
          );
        }

        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/machine-set-types/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSetType.findUnique({
          where: { id: request.params.id },
        });

      if (!current) {
        return notFound(
          reply,
          "Tipo de conjunto não encontrado",
        );
      }

      const usageCount = await prisma.machineSet.count({
        where: { typeId: request.params.id },
      });

      if (usageCount > 0) {
        const updated =
          await prisma.machineSetType.update({
            where: { id: request.params.id },
            data: { isActive: false },
          });

        return {
          deleted: false,
          inactivated: true,
          type: serializeCatalog(updated),
        };
      }

      await prisma.machineSetType.delete({
        where: { id: request.params.id },
      });

      return {
        deleted: true,
        inactivated: false,
        id: request.params.id,
      };
    },
  );

  app.get<{ Querystring: CatalogQuery }>(
    "/api/machine-subset-types",
    async (request) => {
      const includeInactive =
        parseBoolean(request.query.includeInactive) === true;

      const rows =
        await prisma.machineSubsetType.findMany({
          where: includeInactive
            ? undefined
            : { isActive: true },
          orderBy: [
            { displayOrder: "asc" },
            { name: "asc" },
          ],
        });

      return rows.map(serializeCatalog);
    },
  );

  app.post<{ Body: CatalogBody }>(
    "/api/machine-subset-types",
    async (request, reply) => {
      const name = requiredString(request.body?.name);

      if (!name) {
        return badRequest(reply, "Campo name é obrigatório");
      }

      const code = normalizeCode(
        requiredString(request.body?.code) ?? name,
      );

      if (!code) {
        return badRequest(reply, "Campo code é inválido");
      }

      const booleanError = invalidBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const displayOrder = parseDisplayOrder(
        request.body?.displayOrder,
      );

      if (
        request.body?.displayOrder !== undefined &&
        displayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero",
        );
      }

      try {
        const created =
          await prisma.machineSubsetType.create({
            data: {
              code,
              name,
              description: optionalString(
                request.body?.description,
              ),
              isActive:
                parseBoolean(request.body?.isActive) ?? true,
              displayOrder: displayOrder ?? 0,
            },
          });

        return reply
          .status(201)
          .send(serializeCatalog(created));
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return badRequest(
            reply,
            "Já existe um tipo de subconjunto com esse código",
          );
        }

        throw error;
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: CatalogBody;
  }>(
    "/api/machine-subset-types/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSubsetType.findUnique({
          where: { id: request.params.id },
        });

      if (!current) {
        return notFound(
          reply,
          "Tipo de subconjunto não encontrado",
        );
      }

      const nextName =
        request.body?.name === undefined
          ? current.name
          : requiredString(request.body.name);

      if (!nextName) {
        return badRequest(reply, "Campo name é inválido");
      }

      const nextCode =
        request.body?.code === undefined
          ? current.code
          : normalizeCode(
              requiredString(request.body.code) ?? "",
            );

      if (!nextCode) {
        return badRequest(reply, "Campo code é inválido");
      }

      const booleanError = invalidBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const parsedDisplayOrder = parseDisplayOrder(
        request.body?.displayOrder,
      );

      if (
        request.body?.displayOrder !== undefined &&
        parsedDisplayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero",
        );
      }

      try {
        const updated =
          await prisma.machineSubsetType.update({
            where: { id: request.params.id },
            data: {
              code: nextCode,
              name: nextName,
              description:
                request.body?.description === undefined
                  ? current.description
                  : optionalString(
                      request.body.description,
                    ),
              isActive:
                request.body?.isActive === undefined
                  ? current.isActive
                  : parseBoolean(
                      request.body.isActive,
                    ),
              displayOrder:
                request.body?.displayOrder === undefined
                  ? current.displayOrder
                  : parsedDisplayOrder,
            },
          });

        return serializeCatalog(updated);
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return badRequest(
            reply,
            "Já existe um tipo de subconjunto com esse código",
          );
        }

        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/machine-subset-types/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSubsetType.findUnique({
          where: { id: request.params.id },
        });

      if (!current) {
        return notFound(
          reply,
          "Tipo de subconjunto não encontrado",
        );
      }

      const usageCount =
        await prisma.machineSubset.count({
          where: { typeId: request.params.id },
        });

      if (usageCount > 0) {
        const updated =
          await prisma.machineSubsetType.update({
            where: { id: request.params.id },
            data: { isActive: false },
          });

        return {
          deleted: false,
          inactivated: true,
          type: serializeCatalog(updated),
        };
      }

      await prisma.machineSubsetType.delete({
        where: { id: request.params.id },
      });

      return {
        deleted: true,
        inactivated: false,
        id: request.params.id,
      };
    },
  );
}