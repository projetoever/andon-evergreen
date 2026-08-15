import type {
  FastifyInstance,
  FastifyReply,
} from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import {
  badRequest,
  conflict,
  notFound,
  parseBoolean,
} from "./routeUtils.js";

type MachineSubsetQuery = {
  includeInactive?: string;
};

type MachineSubsetBody = {
  machineSetId?: unknown;
  code?: unknown;
  name?: unknown;
  typeId?: unknown;
  description?: unknown;
  manufacturer?: unknown;
  model?: unknown;
  assetTag?: unknown;
  isActive?: unknown;
  displayOrder?: unknown;
};

const subsetTypeSelect = {
  id: true,
  code: true,
  name: true,
  isActive: true,
} satisfies Prisma.MachineSubsetTypeSelect;

const machineSubsetOrderBy:
  Prisma.MachineSubsetOrderByWithRelationInput[] = [
    {
      displayOrder: {
        sort: "asc",
        nulls: "last",
      },
    },
    {
      name: "asc",
    },
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

function validateOptionalText(
  reply: FastifyReply,
  value: unknown,
  fieldName: string,
) {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string"
  ) {
    return badRequest(
      reply,
      `Campo ${fieldName} deve ser texto ou null`,
    );
  }

  return null;
}

async function findSubsetType(typeId: string) {
  return prisma.machineSubsetType.findUnique({
    where: {
      id: typeId,
    },
    select: subsetTypeSelect,
  });
}

export async function registerMachineSubsetRoutes(
  app: FastifyInstance,
) {
  app.get<{
    Params: {
      machineSetId: string;
    };
    Querystring: MachineSubsetQuery;
  }>(
    "/api/machine-sets/:machineSetId/subsets",
    async (request, reply) => {
      const machineSet =
        await prisma.machineSet.findUnique({
          where: {
            id: request.params.machineSetId,
          },
          select: {
            id: true,
          },
        });

      if (!machineSet) {
        return notFound(
          reply,
          "Conjunto não encontrado",
        );
      }

      const includeInactive =
        parseBoolean(
          request.query.includeInactive,
        ) === true;

      return prisma.machineSubset.findMany({
        where: {
          machineSetId:
            request.params.machineSetId,
          ...(includeInactive
            ? {}
            : {
                isActive: true,
              }),
        },
        orderBy: machineSubsetOrderBy,
        include: {
          subsetType: {
            select: subsetTypeSelect,
          },
        },
      });
    },
  );

  app.post<{
    Params: {
      machineSetId: string;
    };
    Body: MachineSubsetBody;
  }>(
    "/api/machine-sets/:machineSetId/subsets",
    async (request, reply) => {
      if (
        request.body?.machineSetId !== undefined
      ) {
        return badRequest(
          reply,
          "machineSetId deve ser informado apenas na URL",
        );
      }

      const machineSet =
        await prisma.machineSet.findUnique({
          where: {
            id: request.params.machineSetId,
          },
          select: {
            id: true,
            isActive: true,
          },
        });

      if (!machineSet) {
        return notFound(
          reply,
          "Conjunto não encontrado",
        );
      }

      if (!machineSet.isActive) {
        return badRequest(
          reply,
          "Não é possível adicionar subconjunto a um conjunto inativo",
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

      const subsetType =
        await findSubsetType(typeId);

      if (!subsetType) {
        return notFound(
          reply,
          "Tipo de subconjunto não encontrado",
        );
      }

      if (!subsetType.isActive) {
        return badRequest(
          reply,
          "O tipo de subconjunto está inativo",
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

      const optionalTextFields = [
        {
          name: "description",
          value: request.body?.description,
        },
        {
          name: "manufacturer",
          value: request.body?.manufacturer,
        },
        {
          name: "model",
          value: request.body?.model,
        },
        {
          name: "assetTag",
          value: request.body?.assetTag,
        },
      ];

      for (const field of optionalTextFields) {
        const validationError =
          validateOptionalText(
            reply,
            field.value,
            field.name,
          );

        if (validationError) {
          return validationError;
        }
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
          await prisma.machineSubset.create({
            data: {
              machineSetId:
                request.params.machineSetId,
              typeId: subsetType.id,
              code,
              name,
              description:
                optionalString(
                  request.body?.description,
                ) ?? null,
              manufacturer:
                optionalString(
                  request.body?.manufacturer,
                ) ?? null,
              model:
                optionalString(
                  request.body?.model,
                ) ?? null,
              assetTag:
                optionalString(
                  request.body?.assetTag,
                ) ?? null,
              isActive:
                parseBoolean(
                  request.body?.isActive,
                ) ?? true,
              displayOrder:
                displayOrder ?? null,
            },
            include: {
              subsetType: {
                select: subsetTypeSelect,
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
            "Já existe um subconjunto com esse código dentro deste conjunto",
          );
        }

        throw error;
      }
    },
  );

  app.patch<{
    Params: {
      id: string;
    };
    Body: MachineSubsetBody;
  }>(
    "/api/machine-subsets/:id",
    async (request, reply) => {
      if (
        request.body?.machineSetId !== undefined
      ) {
        return badRequest(
          reply,
          "machineSetId não pode ser alterado",
        );
      }

      const current =
        await prisma.machineSubset.findUnique({
          where: {
            id: request.params.id,
          },
          include: {
            subsetType: {
              select: subsetTypeSelect,
            },
          },
        });

      if (!current) {
        return notFound(
          reply,
          "Subconjunto não encontrado",
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

      const optionalTextFields = [
        {
          name: "description",
          value: request.body?.description,
        },
        {
          name: "manufacturer",
          value: request.body?.manufacturer,
        },
        {
          name: "model",
          value: request.body?.model,
        },
        {
          name: "assetTag",
          value: request.body?.assetTag,
        },
      ];

      for (const field of optionalTextFields) {
        const validationError =
          validateOptionalText(
            reply,
            field.value,
            field.name,
          );

        if (validationError) {
          return validationError;
        }
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

        const subsetType =
          await findSubsetType(
            requestedTypeId,
          );

        if (!subsetType) {
          return notFound(
            reply,
            "Tipo de subconjunto não encontrado",
          );
        }

        if (!subsetType.isActive) {
          return badRequest(
            reply,
            "O tipo de subconjunto está inativo",
          );
        }

        nextTypeId = subsetType.id;
      }

      const nextDescription =
        request.body?.description ===
        undefined
          ? current.description
          : optionalString(
              request.body.description,
            );

      const nextManufacturer =
        request.body?.manufacturer ===
        undefined
          ? current.manufacturer
          : optionalString(
              request.body.manufacturer,
            );

      const nextModel =
        request.body?.model === undefined
          ? current.model
          : optionalString(
              request.body.model,
            );

      const nextAssetTag =
        request.body?.assetTag === undefined
          ? current.assetTag
          : optionalString(
              request.body.assetTag,
            );

      const nextIsActive =
        request.body?.isActive === undefined
          ? current.isActive
          : parseBoolean(
              request.body.isActive,
            );

      if (nextIsActive === undefined) {
        return badRequest(
          reply,
          "Campo isActive deve ser true ou false",
        );
      }

      if (nextIsActive && !nextTypeId) {
        return badRequest(
          reply,
          "Selecione um tipo de subconjunto ativo antes de reativar este item",
        );
      }

      const nextDisplayOrder =
        request.body?.displayOrder ===
        undefined
          ? current.displayOrder
          : parsedDisplayOrder;

      try {
        return await prisma.machineSubset.update({
          where: {
            id: request.params.id,
          },
          data: {
            code: nextCode,
            name: nextName,
            typeId: nextTypeId,
            description: nextDescription,
            manufacturer: nextManufacturer,
            model: nextModel,
            assetTag: nextAssetTag,
            isActive: nextIsActive,
            displayOrder:
              nextDisplayOrder,
          },
          include: {
            subsetType: {
              select: subsetTypeSelect,
            },
          },
        });
      } catch (error) {
        if (isPrismaError(error, "P2002")) {
          return conflict(
            reply,
            "Já existe um subconjunto com esse código dentro deste conjunto",
          );
        }

        throw error;
      }
    },
  );

  app.delete<{
    Params: {
      id: string;
    };
  }>(
    "/api/machine-subsets/:id",
    async (request, reply) => {
      const current =
        await prisma.machineSubset.findUnique({
          where: {
            id: request.params.id,
          },
          include: {
            subsetType: {
              select: subsetTypeSelect,
            },
          },
        });

      if (!current) {
        return notFound(
          reply,
          "Subconjunto não encontrado",
        );
      }

      const callCount =
        await prisma.andonCall.count({
          where: {
            machineSubsetId:
              request.params.id,
          },
        });

      if (callCount > 0) {
        const updated =
          await prisma.machineSubset.update({
            where: {
              id: request.params.id,
            },
            data: {
              isActive: false,
            },
            include: {
              subsetType: {
                select: subsetTypeSelect,
              },
            },
          });

        return {
          deleted: false,
          inactivated: true,
          subset: updated,
        };
      }

      await prisma.machineSubset.delete({
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
