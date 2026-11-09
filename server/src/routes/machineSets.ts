import type {
  FastifyInstance,
  FastifyReply,
} from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { AccessError } from "../access/policy.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { isAuthorizedCentralMachineSetSettings } from "../security/centralMachineSetSettingsHttp.js";
import { createCentralMachineSet, updateCentralMachineSet } from "../access/centralMachineSetSettings.js";
import {
  badRequest,
  conflict,
  notFound,
  parseBoolean,
} from "./routeUtils.js";

type MachineSetQuery = {
  includeInactive?: string;
  includeSubsets?: string;
};

type MachineSetBody = {
  machineId?: unknown;
  code?: unknown;
  name?: unknown;
  type?: unknown;
  typeId?: unknown;
  description?: unknown;
  isActive?: unknown;
  displayOrder?: unknown;
};

const setTypeSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
} satisfies Prisma.MachineSetTypeSelect;

const subsetTypeSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
} satisfies Prisma.MachineSubsetTypeSelect;

const machineSetOrderBy:
  Prisma.MachineSetOrderByWithRelationInput[] = [
    {
      displayOrder: {
        sort: "asc",
        nulls: "last",
      },
    },
    { name: "asc" },
  ];

const machineSubsetOrderBy:
  Prisma.MachineSubsetOrderByWithRelationInput[] = [
    {
      displayOrder: {
        sort: "asc",
        nulls: "last",
      },
    },
    { name: "asc" },
  ];

function requiredString(value: unknown) {
  return typeof value === "string" &&
    value.trim() !== ""
    ? value.trim()
    : undefined;
}

function optionalString(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() || null;
}

function parseDisplayOrder(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isInteger(numeric) ||
    numeric < 0
  ) {
    return undefined;
  }

  return numeric;
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

function isPrismaError(
  error: unknown,
  code: string,
) {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function validateBoolean(
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

function validateDescription(
  reply: FastifyReply,
  value: unknown,
) {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string"
  ) {
    return badRequest(
      reply,
      "Campo description deve ser texto ou null",
    );
  }

  return null;
}

async function findActiveSetType(
  typeId: string,
) {
  return prisma.machineSetType.findUnique({
    where: { id: typeId },
    select: setTypeSelect,
  });
}

export async function registerMachineSetRoutes(
  app: FastifyInstance,
) {
  app.get<{
    Params: { machineId: string };
    Querystring: MachineSetQuery;
  }>(
    "/api/machines/:machineId/sets",
    async (request, reply) => {
      const machine =
        await prisma.machine.findUnique({
          where: {
            id: request.params.machineId,
          },
          select: { id: true },
        });

      if (!machine) {
        return notFound(
          reply,
          "Máquina não encontrada",
        );
      }

      const includeInactive =
        parseBoolean(
          request.query.includeInactive,
        ) === true;

      const includeSubsets =
        request.query.includeSubsets;

      if (
        includeSubsets !== undefined &&
        includeSubsets !== "count" &&
        includeSubsets !== "list"
      ) {
        return badRequest(
          reply,
          "includeSubsets deve ser count ou list",
        );
      }

      const where:
        Prisma.MachineSetWhereInput = {
          machineId: request.params.machineId,
          ...(includeInactive
            ? {}
            : { isActive: true }),
        };

      if (includeSubsets === "list") {
        return prisma.machineSet.findMany({
          where,
          orderBy: machineSetOrderBy,
          include: {
            setType: {
              select: setTypeSelect,
            },
            subsets: {
              where: includeInactive
                ? undefined
                : { isActive: true },
              orderBy: machineSubsetOrderBy,
              include: {
                subsetType: {
                  select: subsetTypeSelect,
                },
              },
            },
          },
        });
      }

      const rows =
        await prisma.machineSet.findMany({
          where,
          orderBy: machineSetOrderBy,
          include: {
            setType: {
              select: setTypeSelect,
            },
          },
        });

      if (includeSubsets !== "count") {
        return rows;
      }

      if (rows.length === 0) {
        return [];
      }

      const counts =
        await prisma.machineSubset.groupBy({
          by: ["machineSetId"],
          where: {
            machineSetId: {
              in: rows.map((row) => row.id),
            },
            ...(includeInactive
              ? {}
              : { isActive: true }),
          },
          _count: {
            _all: true,
          },
        });

      const countBySetId = new Map(
        counts.map((item) => [
          item.machineSetId,
          item._count._all,
        ]),
      );

      return rows.map((row) => ({
        ...row,
        subsetCount:
          countBySetId.get(row.id) ?? 0,
      }));
    },
  );

  app.post<{
    Params: { machineId: string };
    Body: MachineSetBody;
  }>(
    "/api/machines/:machineId/sets",
    async (request, reply) => {
      if (centralAccessEnabled()) {
        if (!isAuthorizedCentralMachineSetSettings(request))
          throw new AccessError("central_action_not_supported");
        try {
          const set = await createCentralMachineSet(prisma, {
            token: readSecureCookie(request, ACCESS_COOKIE),
            workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
            machineId: request.params.machineId,
            body: request.body, requestId: request.id,
            ipAddress: request.ip.replace(/^::ffff:/, ""),
          });
          return reply.status(201).send(set);
        } catch (error) {
          if (error instanceof AccessError)
            return reply.status(error.statusCode).send({ error: error.code });
          if (isPrismaError(error, "P2002"))
            return reply.status(409).send({ error: "asset_code_in_use" });
          throw error;
        }
      }
      if (request.body?.type !== undefined) {
        return badRequest(
          reply,
          "Campo type é legado. Envie typeId.",
        );
      }

      if (
        request.body?.machineId !== undefined
      ) {
        return badRequest(
          reply,
          "machineId deve ser informado apenas na URL",
        );
      }

      const machine =
        await prisma.machine.findUnique({
          where: {
            id: request.params.machineId,
          },
          select: { id: true },
        });

      if (!machine) {
        return notFound(
          reply,
          "Máquina não encontrada",
        );
      }

      const name = requiredString(
        request.body?.name,
      );

      if (!name) {
        return badRequest(
          reply,
          "Campo name é obrigatório",
        );
      }

      const typeId = requiredString(
        request.body?.typeId,
      );

      if (!typeId) {
        return badRequest(
          reply,
          "Campo typeId é obrigatório",
        );
      }

      const setType =
        await findActiveSetType(typeId);

      if (!setType) {
        return notFound(
          reply,
          "Tipo de conjunto não encontrado",
        );
      }

      if (!setType.isActive) {
        return badRequest(
          reply,
          "O tipo de conjunto está inativo",
        );
      }

      const code = normalizeCode(
        requiredString(request.body?.code) ??
          name,
      );

      if (!code) {
        return badRequest(
          reply,
          "Campo code é inválido",
        );
      }

      const booleanError = validateBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const descriptionError =
        validateDescription(
          reply,
          request.body?.description,
        );

      if (descriptionError) {
        return descriptionError;
      }

      const displayOrder = parseDisplayOrder(
        request.body?.displayOrder,
      );

      if (
        request.body?.displayOrder !==
          undefined &&
        displayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero, ou null",
        );
      }

      try {
        const created =
          await prisma.machineSet.create({
            data: {
              machineId:
                request.params.machineId,
              code,
              name,
              typeId: setType.id,
              type: setType.code,
              description:
                optionalString(
                  request.body?.description,
                ) ?? null,
              isActive:
                parseBoolean(
                  request.body?.isActive,
                ) ?? true,
              displayOrder:
                displayOrder ?? null,
            },
            include: {
              setType: {
                select: setTypeSelect,
              },
            },
          });

        return reply
          .status(201)
          .send(created);
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return conflict(
            reply,
            "Já existe um conjunto com esse código para esta máquina",
          );
        }

        throw error;
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: MachineSetBody;
  }>(
    "/api/machine-sets/:id",
    async (request, reply) => {
      if (centralAccessEnabled()) {
        if (!isAuthorizedCentralMachineSetSettings(request))
          throw new AccessError("central_action_not_supported");
        try {
          return await updateCentralMachineSet(prisma, {
            token: readSecureCookie(request, ACCESS_COOKIE),
            workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
            setId: request.params.id,
            body: request.body, requestId: request.id,
            ipAddress: request.ip.replace(/^::ffff:/, ""),
          });
        } catch (error) {
          if (error instanceof AccessError)
            return reply.status(error.statusCode).send({ error: error.code });
          if (isPrismaError(error, "P2002"))
            return reply.status(409).send({ error: "asset_code_in_use" });
          throw error;
        }
      }
      if (request.body?.type !== undefined) {
        return badRequest(
          reply,
          "Campo type é legado. Envie typeId.",
        );
      }

      if (
        request.body?.machineId !== undefined
      ) {
        return badRequest(
          reply,
          "machineId não pode ser alterado",
        );
      }

      const current =
        await prisma.machineSet.findUnique({
          where: {
            id: request.params.id,
          },
          include: {
            setType: {
              select: setTypeSelect,
            },
          },
        });

      if (!current) {
        return notFound(
          reply,
          "Conjunto não encontrado",
        );
      }

      const nextName =
        request.body?.name === undefined
          ? current.name
          : requiredString(
              request.body.name,
            );

      if (!nextName) {
        return badRequest(
          reply,
          "Campo name é inválido",
        );
      }

      const nextCode =
        request.body?.code === undefined
          ? current.code
          : normalizeCode(
              requiredString(
                request.body.code,
              ) ?? "",
            );

      if (!nextCode) {
        return badRequest(
          reply,
          "Campo code é inválido",
        );
      }

      const booleanError = validateBoolean(
        reply,
        request.body?.isActive,
        "isActive",
      );

      if (booleanError) {
        return booleanError;
      }

      const descriptionError =
        validateDescription(
          reply,
          request.body?.description,
        );

      if (descriptionError) {
        return descriptionError;
      }

      const parsedDisplayOrder =
        parseDisplayOrder(
          request.body?.displayOrder,
        );

      if (
        request.body?.displayOrder !==
          undefined &&
        parsedDisplayOrder === undefined
      ) {
        return badRequest(
          reply,
          "Campo displayOrder deve ser um inteiro maior ou igual a zero, ou null",
        );
      }

      let nextTypeId = current.typeId;
      let nextType = current.type;

      if (
        request.body?.typeId !== undefined
      ) {
        const requestedTypeId =
          requiredString(
            request.body.typeId,
          );

        if (!requestedTypeId) {
          return badRequest(
            reply,
            "Campo typeId é inválido",
          );
        }

        const setType =
          await findActiveSetType(
            requestedTypeId,
          );

        if (!setType) {
          return notFound(
            reply,
            "Tipo de conjunto não encontrado",
          );
        }

        if (!setType.isActive) {
          return badRequest(
            reply,
            "O tipo de conjunto está inativo",
          );
        }

        nextTypeId = setType.id;
        nextType = setType.code;
      }

      const nextDescription =
        request.body?.description ===
        undefined
          ? current.description
          : optionalString(
              request.body.description,
            );

      const nextIsActive =
        request.body?.isActive === undefined
          ? current.isActive
          : parseBoolean(
              request.body.isActive,
            );

      const nextDisplayOrder =
        request.body?.displayOrder ===
        undefined
          ? current.displayOrder
          : parsedDisplayOrder;

      try {
        return await prisma.machineSet.update({
          where: {
            id: request.params.id,
          },
          data: {
            code: nextCode,
            name: nextName,
            typeId: nextTypeId,
            type: nextType,
            description: nextDescription,
            isActive: nextIsActive,
            displayOrder:
              nextDisplayOrder,
          },
          include: {
            setType: {
              select: setTypeSelect,
            },
          },
        });
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return conflict(
            reply,
            "Já existe um conjunto com esse código para esta máquina",
          );
        }

        throw error;
      }
    },
  );

  app.delete<{
    Params: { id: string };
  }>(
    "/api/machine-sets/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSet.findUnique({
          where: {
            id: request.params.id,
          },
          include: {
            setType: {
              select: setTypeSelect,
            },
          },
        });

      if (!current) {
        return notFound(
          reply,
          "Conjunto não encontrado",
        );
      }

      const subsetCount =
        await prisma.machineSubset.count({
          where: {
            machineSetId:
              request.params.id,
          },
        });

      if (subsetCount > 0) {
        return conflict(
          reply,
          "O conjunto possui subconjuntos. Exclua ou inative os subconjuntos antes de tratar o conjunto.",
        );
      }

      const callCount =
        await prisma.andonCall.count({
          where: {
            machineSetId:
              request.params.id,
          },
        });

      if (callCount > 0) {
        const updated =
          await prisma.machineSet.update({
            where: {
              id: request.params.id,
            },
            data: {
              isActive: false,
            },
            include: {
              setType: {
                select: setTypeSelect,
              },
            },
          });

        return {
          deleted: false,
          inactivated: true,
          set: updated,
        };
      }

      await prisma.machineSet.delete({
        where: {
          id: request.params.id,
        },
      });

      return {
        deleted: true,
        inactivated: false,
        id: request.params.id,
      };
    },
  );
}