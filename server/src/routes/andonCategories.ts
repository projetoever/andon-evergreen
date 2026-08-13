import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { badRequest, conflict, notFound, parseBoolean } from "./routeUtils.js";

const CATEGORY_GROUPS = new Set(["maintenance", "production"]);
const CATEGORY_ID_PATTERN = /^[a-z0-9_]{2,40}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

type CategoryQuery = {
  active?: string;
};

type CategoryBody = {
  id?: unknown;
  displayName?: unknown;
  categoryGroup?: unknown;
  color?: unknown;
  active?: unknown;
  displayOrder?: unknown;
};

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDisplayOrder(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999 ? parsed : undefined;
}

export async function registerAndonCategoryRoutes(app: FastifyInstance) {
  app.get<{ Querystring: CategoryQuery }>("/api/andon-categories", async (request) => {
    const active = parseBoolean(request.query.active);
    return prisma.andonCategory.findMany({
      where: active === undefined ? undefined : { active },
      orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    });
  });

  app.post<{ Body: CategoryBody }>("/api/andon-categories", async (request, reply) => {
    const id = requiredString(request.body?.id)?.toLowerCase();
    const displayName = requiredString(request.body?.displayName);
    const categoryGroup = requiredString(request.body?.categoryGroup);
    const color = requiredString(request.body?.color)?.toUpperCase();
    const active = parseBoolean(request.body?.active) ?? true;
    const displayOrder = parseDisplayOrder(request.body?.displayOrder) ?? 0;

    if (!id || !CATEGORY_ID_PATTERN.test(id)) {
      return badRequest(reply, "ID inválido. Use letras minúsculas, números e underscore");
    }
    if (!displayName || displayName.length > 60) {
      return badRequest(reply, "Informe um nome de setor com até 60 caracteres");
    }
    if (!categoryGroup || !CATEGORY_GROUPS.has(categoryGroup)) {
      return badRequest(reply, "Grupo do setor inválido");
    }
    if (!color || !HEX_COLOR_PATTERN.test(color)) {
      return badRequest(reply, "Cor inválida. Use o formato hexadecimal #RRGGBB");
    }

    const existing = await prisma.andonCategory.findUnique({ where: { id }, select: { id: true } });
    if (existing) return conflict(reply, "Já existe um setor com este ID");

    const category = await prisma.andonCategory.create({
      data: { id, displayName, categoryGroup, color, active, displayOrder },
    });
    return reply.status(201).send(category);
  });

  app.patch<{ Params: { id: string }; Body: CategoryBody }>(
    "/api/andon-categories/:id",
    async (request, reply) => {
      const current = await prisma.andonCategory.findUnique({ where: { id: request.params.id } });
      if (!current) return notFound(reply, "Setor não encontrado");

      const displayName =
        "displayName" in (request.body ?? {})
          ? requiredString(request.body.displayName)
          : undefined;
      const categoryGroup =
        "categoryGroup" in (request.body ?? {})
          ? requiredString(request.body.categoryGroup)
          : undefined;
      const color =
        "color" in (request.body ?? {})
          ? requiredString(request.body.color)?.toUpperCase()
          : undefined;
      const active =
        "active" in (request.body ?? {}) ? parseBoolean(request.body.active) : undefined;
      const displayOrder =
        "displayOrder" in (request.body ?? {})
          ? parseDisplayOrder(request.body.displayOrder)
          : undefined;

      if ("displayName" in (request.body ?? {}) && (!displayName || displayName.length > 60)) {
        return badRequest(reply, "Informe um nome de setor com até 60 caracteres");
      }
      if (
        "categoryGroup" in (request.body ?? {}) &&
        (!categoryGroup || !CATEGORY_GROUPS.has(categoryGroup))
      ) {
        return badRequest(reply, "Grupo do setor inválido");
      }
      if ("color" in (request.body ?? {}) && (!color || !HEX_COLOR_PATTERN.test(color))) {
        return badRequest(reply, "Cor inválida. Use o formato hexadecimal #RRGGBB");
      }
      if ("active" in (request.body ?? {}) && active === undefined) {
        return badRequest(reply, "Status do setor inválido");
      }
      if ("displayOrder" in (request.body ?? {}) && displayOrder === undefined) {
        return badRequest(reply, "Ordem de exibição inválida");
      }
      if (categoryGroup === "production" && current.categoryGroup === "maintenance") {
        const assignedTechnicians = await prisma.technician.count({
          where: { technicalArea: current.id },
        });
        if (assignedTechnicians > 0) {
          return conflict(
            reply,
            "Realoque os mantenedores deste setor antes de alterar o grupo para produção",
          );
        }
      }

      return prisma.andonCategory.update({
        where: { id: current.id },
        data: {
          ...(displayName ? { displayName } : {}),
          ...(categoryGroup ? { categoryGroup } : {}),
          ...(color ? { color } : {}),
          ...(active !== undefined ? { active } : {}),
          ...(displayOrder !== undefined ? { displayOrder } : {}),
        },
      });
    },
  );

  app.delete<{ Params: { id: string } }>("/api/andon-categories/:id", async (request, reply) => {
    const current = await prisma.andonCategory.findUnique({ where: { id: request.params.id } });
    if (!current) return notFound(reply, "Setor não encontrado");

    const [historicalCalls, assignedTechnicians] = await Promise.all([
      prisma.andonCall.count({ where: { subtype: current.id } }),
      prisma.technician.count({ where: { technicalArea: current.id } }),
    ]);
    if (historicalCalls > 0) {
      return conflict(
        reply,
        "Este setor já possui chamados registrados. Inative-o para preservar o histórico",
      );
    }
    if (assignedTechnicians > 0) {
      return conflict(
        reply,
        "Este setor possui mantenedores cadastrados. Realoque-os ou inative o setor",
      );
    }

    await prisma.andonCategory.delete({ where: { id: current.id } });
    return reply.status(204).send();
  });
}
