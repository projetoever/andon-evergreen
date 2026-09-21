import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { badRequest, conflict, notFound, parseBoolean } from "./routeUtils.js";

const CLASSIFICATION_VALUE_PATTERN = /^[a-z0-9_]{2,64}$/;

type FailureClassificationQuery = {
  active?: string;
};

type FailureClassificationBody = {
  label?: unknown;
  value?: unknown;
  active?: unknown;
};

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function registerFailureClassificationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: FailureClassificationQuery }>(
    "/api/failure-classifications",
    async (request) => {
      const active = parseBoolean(request.query.active);
      const where: Prisma.FailureClassificationWhereInput = {
        ...(active !== undefined ? { active } : {}),
      };

      return prisma.failureClassification.findMany({
        where,
        orderBy: { label: "asc" },
      });
    },
  );

  app.post<{ Body: FailureClassificationBody }>(
    "/api/failure-classifications",
    async (request, reply) => {
      const label = requiredString(request.body?.label);
      const value = requiredString(request.body?.value)?.toLowerCase();
      const active = parseBoolean(request.body?.active) ?? true;

      if (!label || label.length > 100) {
        return badRequest(reply, "Informe um nome de classificação com até 100 caracteres");
      }
      if (!value || !CLASSIFICATION_VALUE_PATTERN.test(value)) {
        return badRequest(
          reply,
          "Identificador inválido. Use letras minúsculas, números e underscore",
        );
      }
      if (request.body?.active !== undefined && parseBoolean(request.body.active) === undefined) {
        return badRequest(reply, "Status da classificação inválido");
      }

      try {
        const classification = await prisma.failureClassification.create({
          data: { label, value, active },
        });
        return reply.status(201).send(classification);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return conflict(reply, "Já existe uma classificação com este identificador");
        }
        throw error;
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: FailureClassificationBody }>(
    "/api/failure-classifications/:id",
    async (request, reply) => {
      const current = await prisma.failureClassification.findUnique({
        where: { id: request.params.id },
      });
      if (!current) return notFound(reply, "Classificação não encontrada");

      if (request.body && "value" in request.body) {
        return badRequest(reply, "O identificador interno não pode ser alterado após a criação");
      }

      const label =
        request.body && "label" in request.body ? requiredString(request.body.label) : undefined;
      const active =
        request.body && "active" in request.body ? parseBoolean(request.body.active) : undefined;

      if (request.body && "label" in request.body && (!label || label.length > 100)) {
        return badRequest(reply, "Informe um nome de classificação com até 100 caracteres");
      }
      if (request.body && "active" in request.body && active === undefined) {
        return badRequest(reply, "Status da classificação inválido");
      }
      if (label === undefined && active === undefined) {
        return badRequest(reply, "Informe label ou active para atualizar a classificação");
      }

      return prisma.failureClassification.update({
        where: { id: current.id },
        data: {
          ...(label ? { label } : {}),
          ...(active !== undefined ? { active } : {}),
        },
      });
    },
  );
}
