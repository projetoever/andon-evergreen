import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";

import { lockMachineFlow } from "../db/machineFlowLock.js";
import { prisma } from "../db/prisma.js";
import {
  buildCurrentPrioritySnapshot,
  buildPrioritySnapshot,
  diffPrioritySnapshots,
  sortPriorityMachineIds,
  type PriorityMachineState,
} from "../domain/machinePriorityHistory.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

const MACHINE_STATUSES = new Set(["running", "stopped"]);
const PRODUCTION_MODES = new Set(["scheduled", "not_scheduled", "production"]);

type MachineQuery = { includeInactive?: string };
type MachineStatusBody = { machineStatus?: unknown };
type ProductionModeBody = { productionMode?: unknown };
type CreateMachineBody = {
  id?: unknown;
  name?: unknown;
  productionMode?: unknown;
  requireWorkOrderAtOpen?: unknown;
};
type UpdateMachineBody = {
  name?: unknown;
  productionMode?: unknown;
  requireWorkOrderAtOpen?: unknown;
};
type ActiveMachineBody = { isActive?: unknown };

function requiredBodyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function optionalBodyString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeProductionMode(value: string | undefined) {
  if (!value) return undefined;
  return value === "production" ? "scheduled" : value;
}

function diffSeconds(start: Date, end = new Date()) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

const machineSelect = {
  id: true,
  name: true,
  machineStatus: true,
  andonStatus: true,
  productionMode: true,
  requireWorkOrderAtOpen: true,
  isActive: true,
  displayOrder: true,
  priorityOrder: true,
  currentCallId: true,
  lastStatusChangedAt: true,
  createdAt: true,
  updatedAt: true,
  productionEvents: {
    select: {
      id: true,
      machineId: true,
      productionMode: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
    },
    orderBy: { startedAt: "desc" as const },
    take: 200,
  },
};

function sortMachinesByNumber<T extends { id: string; name: string; displayOrder?: number | null }>(machines: T[]) {
  return machines.sort((current, next) => {
    if (current.displayOrder != null && next.displayOrder != null) return current.displayOrder - next.displayOrder;
    const currentNumber = Number(current.id);
    const nextNumber = Number(next.id);
    if (Number.isFinite(currentNumber) && Number.isFinite(nextNumber)) return currentNumber - nextNumber;
    return current.name.localeCompare(next.name, "pt-BR", { numeric: true });
  });
}

async function findMachineOr404(id: string, reply: Parameters<typeof notFound>[0]) {
  const machine = await prisma.machine.findUnique({ where: { id }, select: { id: true, currentCallId: true } });
  if (!machine) return notFound(reply, "Máquina não encontrada");
  return machine;
}

export async function registerMachineRoutes(app: FastifyInstance) {
  app.get<{ Querystring: MachineQuery }>("/api/machines", async (request) => {
    const includeInactive = parseBoolean(request.query.includeInactive) === true;
    const machines = await prisma.machine.findMany({
      where: includeInactive ? undefined : { isActive: true },
      select: machineSelect,
    });
    return sortMachinesByNumber(machines);
  });

  app.post<{ Body: CreateMachineBody }>("/api/machines", async (request, reply) => {
    const id = requiredBodyString(request.body?.id);
    if (!id) return badRequest(reply, "Campo id é obrigatório");

    const productionMode = normalizeProductionMode(requiredBodyString(request.body?.productionMode) ?? "scheduled");
    if (!productionMode || !PRODUCTION_MODES.has(productionMode)) return badRequest(reply, "Modo de produção inválido");
    const parsedRequireWorkOrderAtOpen = parseBoolean(request.body?.requireWorkOrderAtOpen);
    if (
      "requireWorkOrderAtOpen" in (request.body ?? {}) &&
      parsedRequireWorkOrderAtOpen === undefined
    ) {
      return badRequest(reply, "Campo requireWorkOrderAtOpen deve ser booleano");
    }
    const requireWorkOrderAtOpen = parsedRequireWorkOrderAtOpen ?? false;

    try {
      const [highestOrder, activeMachineCount, machineCount] = await Promise.all([
        prisma.machine.aggregate({
          _max: {
            priorityOrder: true,
            displayOrder: true,
          },
        }),
        prisma.machine.count({ where: { isActive: true } }),
        prisma.machine.count(),
      ]);
      const nextPriorityOrder =
        Math.max(
          highestOrder._max.priorityOrder ?? 0,
          highestOrder._max.displayOrder ?? 0,
        ) + 1;
      const createdAt = new Date();
      const initialPriorityRank = activeMachineCount < 5 ? activeMachineCount + 1 : null;

      const machine = await prisma.machine.create({
        data: {
          id,
          name: optionalBodyString(request.body?.name) || `Máquina ${id}`,
          productionMode,
          requireWorkOrderAtOpen,
          displayOrder: Number.isFinite(Number(id)) ? Number(id) : undefined,
          priorityOrder: nextPriorityOrder,
          machineStatus: "running",
          andonStatus: "normal",
          currentCallId: null,
          isActive: true,
          productionEvents: { create: { productionMode, startedAt: createdAt } },
          priorityHistory: {
            create: {
              previousOrder: null,
              newOrder: machineCount + 1,
              previousPriorityRank: null,
              newPriorityRank: initialPriorityRank,
              changedAt: createdAt,
              source: "machine_created",
            },
          },
        },
        select: machineSelect,
      });
      return reply.status(201).send(machine);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return badRequest(reply, "Já existe uma máquina com este id");
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/machines/:id", async (request, reply) => {
    const machine = await prisma.machine.findUnique({ where: { id: request.params.id }, select: machineSelect });
    if (!machine) return notFound(reply, "Máquina não encontrada");
    return machine;
  });

  app.patch<{ Params: { id: string }; Body: UpdateMachineBody }>(
    "/api/machines/:id",
    async (request, reply) => {
      const machine = await findMachineOr404(request.params.id, reply);
      if (!("id" in machine)) return machine;
      if ("productionMode" in (request.body ?? {})) {
        return badRequest(
          reply,
          "Use a rota específica de modo de produção para preservar o histórico operacional",
        );
      }
      const requireWorkOrderAtOpen = parseBoolean(request.body?.requireWorkOrderAtOpen);
      if (
        "requireWorkOrderAtOpen" in (request.body ?? {}) &&
        requireWorkOrderAtOpen === undefined
      ) {
        return badRequest(reply, "Campo requireWorkOrderAtOpen deve ser booleano");
      }
      return prisma.machine.update({
        where: { id: request.params.id },
        data: {
          ...(optionalBodyString(request.body?.name)
            ? { name: optionalBodyString(request.body?.name) }
            : {}),
          ...(requireWorkOrderAtOpen !== undefined ? { requireWorkOrderAtOpen } : {}),
        },
        select: machineSelect,
      });
    },
  );

  app.patch<{ Params: { id: string }; Body: ActiveMachineBody }>("/api/machines/:id/active", async (request, reply) => {
    const isActive = parseBoolean(request.body?.isActive);
    if (isActive === undefined) return badRequest(reply, "Campo isActive inválido");
    const machine = await findMachineOr404(request.params.id, reply);
    if (!("id" in machine)) return machine;
    if (!isActive && machine.currentCallId) return badRequest(reply, "Não é possível desativar máquina com chamado ativo");

    const currentMachines = await prisma.machine.findMany({
      select: {
        id: true,
        isActive: true,
        priorityOrder: true,
        displayOrder: true,
      },
    });
    const currentTarget = currentMachines.find((item) => item.id === request.params.id);
    if (!currentTarget) return notFound(reply, "Máquina não encontrada");

    if (currentTarget.isActive === isActive) {
      return prisma.machine.findUniqueOrThrow({
        where: { id: request.params.id },
        select: machineSelect,
      });
    }

    const previousSnapshot = buildCurrentPrioritySnapshot(currentMachines);
    const nextMachines: PriorityMachineState[] = currentMachines.map((item) =>
      item.id === request.params.id ? { ...item, isActive } : item,
    );
    const nextById = new Map(nextMachines.map((item) => [item.id, item]));
    const orderedIds = sortPriorityMachineIds(nextMachines);
    const nextSnapshot = buildPrioritySnapshot(orderedIds, nextById);
    const priorityChanges = diffPrioritySnapshots(
      orderedIds,
      previousSnapshot,
      nextSnapshot,
    );
    const changedAt = new Date();

    return prisma.$transaction(async (tx) => {
      const updated = await tx.machine.update({
        where: { id: request.params.id },
        data: { isActive },
        select: machineSelect,
      });

      for (const change of priorityChanges) {
        await tx.machinePriorityHistory.create({
          data: {
            machineId: change.machineId,
            previousOrder: change.previousOrder,
            newOrder: change.newOrder,
            previousPriorityRank: change.previousPriorityRank,
            newPriorityRank: change.newPriorityRank,
            changedAt,
            source: "machine_activation",
            reason: isActive ? "activated" : "inactivated",
          },
        });
      }

      return updated;
    });
  });

  app.patch<{ Params: { id: string }; Body: MachineStatusBody }>(
    "/api/machines/:id/status",
    async (request, reply) => {
      const machineStatus = requiredBodyString(request.body?.machineStatus);
      if (!machineStatus || !MACHINE_STATUSES.has(machineStatus)) {
        return badRequest(reply, "Status operacional inválido");
      }

      const machine = await findMachineOr404(request.params.id, reply);
      if (!("id" in machine)) return machine;

      return prisma.$transaction(async (tx) => {
        await lockMachineFlow(tx, request.params.id);

        const currentMachine = await tx.machine.findUnique({
          where: { id: request.params.id },
          select: {
            id: true,
            machineStatus: true,
            productionMode: true,
          },
        });
        if (!currentMachine) throw new Error("Máquina não encontrada");

        const openFailureEvents = await tx.failureEvent.findMany({
          where: {
            machineId: request.params.id,
            endedAt: null,
          },
          orderBy: { startedAt: "desc" },
        });

        if (machineStatus === "stopped") {
          if (openFailureEvents.length > 0) {
            if (currentMachine.machineStatus === "stopped") {
              return tx.machine.findUniqueOrThrow({
                where: { id: request.params.id },
                select: machineSelect,
              });
            }

            return tx.machine.update({
              where: { id: request.params.id },
              data: {
                machineStatus: "stopped",
                lastStatusChangedAt: openFailureEvents[0].startedAt,
              },
              select: machineSelect,
            });
          }

          const now = new Date();
          await tx.failureEvent.create({
            data: {
              machineId: request.params.id,
              startedAt: now,
              classification: "unidentified_stop",
              source: "manual",
              productionMode: currentMachine.productionMode,
              machineStatus: "stopped",
              notes: "Falha gerada por atualização direta de status",
            },
          });

          return tx.machine.update({
            where: { id: request.params.id },
            data: {
              machineStatus: "stopped",
              lastStatusChangedAt: now,
            },
            select: machineSelect,
          });
        }

        if (currentMachine.machineStatus === "running" && openFailureEvents.length === 0) {
          return tx.machine.findUniqueOrThrow({
            where: { id: request.params.id },
            select: machineSelect,
          });
        }

        const now = new Date();
        for (const event of openFailureEvents) {
          await tx.failureEvent.update({
            where: { id: event.id },
            data: {
              endedAt: now,
              durationSeconds: event.durationSeconds ?? diffSeconds(event.startedAt, now),
              machineStatus: "running",
              notes: event.notes ?? "Máquina pronta para rodar por atualização direta de status",
            },
          });
        }

        return tx.machine.update({
          where: { id: request.params.id },
          data: {
            machineStatus: "running",
            lastStatusChangedAt: now,
          },
          select: machineSelect,
        });
      });
    },
  );

  app.patch<{ Params: { id: string }; Body: ProductionModeBody }>("/api/machines/:id/production-mode", async (request, reply) => {
    const productionMode = normalizeProductionMode(requiredBodyString(request.body?.productionMode));
    if (!productionMode || !PRODUCTION_MODES.has(productionMode)) return badRequest(reply, "Modo de produção inválido");

    const machine = await findMachineOr404(request.params.id, reply);
    if (!("id" in machine)) return machine;

    return prisma.$transaction(async (tx) => {
      await lockMachineFlow(tx, request.params.id);

      const currentMachine = await tx.machine.findUnique({
        where: { id: request.params.id },
        select: { id: true, productionMode: true },
      });

      if (!currentMachine) throw new Error("Máquina não encontrada");

      const openProductionEvent = await tx.machineProductionEvent.findFirst({
        where: { machineId: request.params.id, endedAt: null },
        orderBy: { startedAt: "desc" },
      });

      if (currentMachine.productionMode === productionMode && openProductionEvent) {
        return tx.machine.findUniqueOrThrow({ where: { id: request.params.id }, select: machineSelect });
      }

      const now = new Date();

      if (openProductionEvent) {
        await tx.machineProductionEvent.update({
          where: { id: openProductionEvent.id },
          data: {
            endedAt: now,
            durationSeconds: diffSeconds(openProductionEvent.startedAt, now),
          },
        });
      }

      await tx.machineProductionEvent.create({
        data: {
          machineId: request.params.id,
          productionMode,
          startedAt: now,
        },
      });

      return tx.machine.update({
        where: { id: request.params.id },
        data: { productionMode },
        select: machineSelect,
      });
    });
  });
}
