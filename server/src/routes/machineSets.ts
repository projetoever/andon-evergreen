import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

type MachineSetQuery = { includeInactive?: string };
type MachineSetBody = {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  description?: unknown;
  isActive?: unknown;
  displayOrder?: unknown;
};

type MachineSetRow = {
  id: string;
  machineId: string;
  code: string;
  name: string;
  type: string | null;
  description: string | null;
  isActive: boolean;
  displayOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
};

function requiredString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value.trim() || null : undefined;
}

function optionalNumber(value: unknown) {
  if (value === null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
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

function serializeMachineSet(row: MachineSetRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findMachineSetById(id: string) {
  const rows = await prisma.$queryRaw<MachineSetRow[]>(Prisma.sql`
    SELECT * FROM "machine_sets" WHERE "id" = ${id} LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function registerMachineSetRoutes(app: FastifyInstance) {
  app.get<{ Params: { machineId: string }; Querystring: MachineSetQuery }>("/api/machines/:machineId/sets", async (request, reply) => {
    const machine = await prisma.machine.findUnique({ where: { id: request.params.machineId }, select: { id: true } });
    if (!machine) return notFound(reply, "Máquina não encontrada");

    const includeInactive = parseBoolean(request.query.includeInactive) === true;
    const rows = await prisma.$queryRaw<MachineSetRow[]>(Prisma.sql`
      SELECT * FROM "machine_sets"
      WHERE "machineId" = ${request.params.machineId}
      ${includeInactive ? Prisma.empty : Prisma.sql`AND "isActive" = true`}
      ORDER BY "displayOrder" ASC NULLS LAST, "name" ASC
    `);

    return rows.map(serializeMachineSet);
  });

  app.post<{ Params: { machineId: string }; Body: MachineSetBody }>("/api/machines/:machineId/sets", async (request, reply) => {
    const machine = await prisma.machine.findUnique({ where: { id: request.params.machineId }, select: { id: true } });
    if (!machine) return notFound(reply, "Máquina não encontrada");

    const name = requiredString(request.body?.name);
    if (!name) return badRequest(reply, "Campo name é obrigatório");

    const code = normalizeCode(requiredString(request.body?.code) ?? name);
    if (!code) return badRequest(reply, "Campo code é inválido");

    const type = optionalString(request.body?.type);
    const description = optionalString(request.body?.description);
    const isActive = parseBoolean(request.body?.isActive) ?? true;
    const displayOrder = optionalNumber(request.body?.displayOrder);

    try {
      const rows = await prisma.$queryRaw<MachineSetRow[]>(Prisma.sql`
        INSERT INTO "machine_sets" ("id", "machineId", "code", "name", "type", "description", "isActive", "displayOrder", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${request.params.machineId}, ${code}, ${name}, ${type}, ${description}, ${isActive}, ${displayOrder}, NOW(), NOW())
        RETURNING *
      `);
      return reply.status(201).send(serializeMachineSet(rows[0]));
    } catch (error) {
      app.log.warn({ error }, "Erro ao criar conjunto de máquina");
      return badRequest(reply, "Não foi possível criar o conjunto. Verifique se o código já existe para esta máquina.");
    }
  });

  app.patch<{ Params: { id: string }; Body: MachineSetBody }>("/api/machine-sets/:id", async (request, reply) => {
    const current = await findMachineSetById(request.params.id);
    if (!current) return notFound(reply, "Conjunto não encontrado");

    const nextName = requiredString(request.body?.name) ?? current.name;
    const nextCode = request.body?.code === undefined ? current.code : normalizeCode(requiredString(request.body?.code) ?? "");
    if (!nextCode) return badRequest(reply, "Campo code é inválido");

    const nextType = request.body?.type === undefined ? current.type : optionalString(request.body?.type);
    const nextDescription = request.body?.description === undefined ? current.description : optionalString(request.body?.description);
    const nextIsActive = parseBoolean(request.body?.isActive) ?? current.isActive;
    const parsedDisplayOrder = optionalNumber(request.body?.displayOrder);
    const nextDisplayOrder = request.body?.displayOrder === undefined ? current.displayOrder : parsedDisplayOrder;

    try {
      const rows = await prisma.$queryRaw<MachineSetRow[]>(Prisma.sql`
        UPDATE "machine_sets"
        SET
          "code" = ${nextCode},
          "name" = ${nextName},
          "type" = ${nextType},
          "description" = ${nextDescription},
          "isActive" = ${nextIsActive},
          "displayOrder" = ${nextDisplayOrder},
          "updatedAt" = NOW()
        WHERE "id" = ${request.params.id}
        RETURNING *
      `);
      return serializeMachineSet(rows[0]);
    } catch (error) {
      app.log.warn({ error }, "Erro ao atualizar conjunto de máquina");
      return badRequest(reply, "Não foi possível atualizar o conjunto. Verifique se o código já existe para esta máquina.");
    }
  });

  app.delete<{ Params: { id: string } }>("/api/machine-sets/:id", async (request, reply) => {
    const current = await findMachineSetById(request.params.id);
    if (!current) return notFound(reply, "Conjunto não encontrado");

    const usage = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count FROM "andon_calls" WHERE "machineSetId" = ${request.params.id}
    `);
    const usageCount = Number(usage[0]?.count ?? 0);

    if (usageCount > 0) {
      const rows = await prisma.$queryRaw<MachineSetRow[]>(Prisma.sql`
        UPDATE "machine_sets"
        SET "isActive" = false, "updatedAt" = NOW()
        WHERE "id" = ${request.params.id}
        RETURNING *
      `);
      return { deleted: false, inactivated: true, set: serializeMachineSet(rows[0]) };
    }

    await prisma.$executeRaw(Prisma.sql`DELETE FROM "machine_sets" WHERE "id" = ${request.params.id}`);
    return { deleted: true, inactivated: false, id: request.params.id };
  });
}
