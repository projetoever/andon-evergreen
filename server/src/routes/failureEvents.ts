import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound, parseDate, parseLimit } from "./routeUtils.js";

type FailureEventQuery = {
  machineId?: string;
  startDate?: string;
  endDate?: string;
  classification?: string;
  limit?: string;
};

type CreateFailureEventBody = {
  machineId?: unknown;
  callId?: unknown;
  classification?: unknown;
  source?: unknown;
  productionMode?: unknown;
  machineStatus?: unknown;
  notes?: unknown;
};

type FinishFailureEventBody = {
  notes?: unknown;
  machineStatus?: unknown;
};

const MACHINE_STATUSES = new Set(["running", "stopped"]);

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function diffSeconds(start: Date, end = new Date()) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

export async function registerFailureEventRoutes(app: FastifyInstance) {
  app.get<{ Querystring: FailureEventQuery }>("/api/failure-events", async (request) => {
    const { machineId, classification } = request.query;
    const startDate = parseDate(request.query.startDate);
    const endDate = parseDate(request.query.endDate);
    const where: Prisma.FailureEventWhereInput = {
      ...(machineId ? { machineId } : {}),
      ...(classification ? { classification } : {}),
      ...(startDate || endDate
        ? {
            startedAt: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    return prisma.failureEvent.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: parseLimit(request.query.limit),
    });
  });

  app.post<{ Body: CreateFailureEventBody }>("/api/failure-events", async (request, reply) => {
    const body = request.body ?? {};
    const machineId = body.machineId === undefined ? undefined : String(body.machineId);
    const callId = optionalString(body.callId);
    const classification = optionalString(body.classification) ?? "unclassified";
    const source = optionalString(body.source) ?? "manual";
    const productionMode = optionalString(body.productionMode);
    const machineStatus = optionalString(body.machineStatus) ?? "stopped";
    const notes = optionalString(body.notes);

    if (!machineId) return badRequest(reply, "Campo machineId é obrigatório");
    if (!MACHINE_STATUSES.has(machineStatus)) return badRequest(reply, "Status operacional inválido");

    const machine = await prisma.machine.findUnique({ where: { id: machineId } });
    if (!machine) return notFound(reply, "Máquina não encontrada");

    const openEvent = await prisma.failureEvent.findFirst({
      where: { machineId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });

    if (openEvent) {
      const updatedMachine = await prisma.machine.update({
        where: { id: machineId },
        data: { machineStatus: "stopped", lastStatusChangedAt: openEvent.startedAt },
      });
      return reply.status(200).send({ event: openEvent, machine: updatedMachine });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.failureEvent.create({
        data: {
          machineId,
          callId,
          startedAt: now,
          classification,
          source,
          productionMode: productionMode ?? machine.productionMode,
          machineStatus,
          notes,
        },
      });

      const updatedMachine = await tx.machine.update({
        where: { id: machineId },
        data: { machineStatus: "stopped", lastStatusChangedAt: now },
      });

      return { event, machine: updatedMachine };
    });

    return reply.status(201).send(result);
  });

  app.patch<{ Params: { id: string }; Body: FinishFailureEventBody }>("/api/failure-events/:id/finish", async (request, reply) => {
    const event = await prisma.failureEvent.findUnique({ where: { id: request.params.id } });
    if (!event) return notFound(reply, "Evento de falha não encontrado");

    const machineStatus = optionalString(request.body?.machineStatus) ?? "running";
    if (!MACHINE_STATUSES.has(machineStatus)) return badRequest(reply, "Status operacional inválido");

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const finishedEvent = await tx.failureEvent.update({
        where: { id: event.id },
        data: {
          endedAt: event.endedAt ?? now,
          durationSeconds: event.durationSeconds ?? diffSeconds(event.startedAt, now),
          notes: optionalString(request.body?.notes) ?? event.notes,
          machineStatus,
        },
      });

      const updatedMachine = await tx.machine.update({
        where: { id: event.machineId },
        data: { machineStatus, lastStatusChangedAt: now },
      });

      return { event: finishedEvent, machine: updatedMachine };
    });

    return result;
  });
}
