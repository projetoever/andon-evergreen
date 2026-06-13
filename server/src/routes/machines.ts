import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { badRequest, notFound } from "./routeUtils.js";

const MACHINE_STATUSES = new Set(["running", "stopped"]);
const PRODUCTION_MODES = new Set(["scheduled", "not_scheduled", "production"]);

type MachineStatusBody = {
  machineStatus?: unknown;
};

type ProductionModeBody = {
  productionMode?: unknown;
};

function requiredBodyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

const machineSelect = {
  id: true,
  name: true,
  machineStatus: true,
  andonStatus: true,
  productionMode: true,
  currentCallId: true,
  lastStatusChangedAt: true,
  createdAt: true,
  updatedAt: true,
};

function sortMachinesByNumber<T extends { id: string; name: string }>(machines: T[]) {
  return machines.sort((current, next) => {
    const currentNumber = Number(current.id);
    const nextNumber = Number(next.id);

    if (Number.isFinite(currentNumber) && Number.isFinite(nextNumber)) {
      return currentNumber - nextNumber;
    }

    return current.name.localeCompare(next.name, "pt-BR", { numeric: true });
  });
}

export async function registerMachineRoutes(app: FastifyInstance) {
  app.get("/api/machines", async () => {
    const machines = await prisma.machine.findMany({ select: machineSelect });

    return sortMachinesByNumber(machines);
  });

  app.get<{ Params: { id: string } }>("/api/machines/:id", async (request, reply) => {
    const machine = await prisma.machine.findUnique({
      where: { id: request.params.id },
      select: machineSelect,
    });

    if (!machine) {
      return notFound(reply, "Máquina não encontrada");
    }

    return machine;
  });

  app.patch<{ Params: { id: string }; Body: MachineStatusBody }>("/api/machines/:id/status", async (request, reply) => {
    const machineStatus = requiredBodyString(request.body?.machineStatus);
    if (!machineStatus || !MACHINE_STATUSES.has(machineStatus)) {
      return badRequest(reply, "Status operacional inválido");
    }

    const machine = await prisma.machine.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!machine) {
      return notFound(reply, "Máquina não encontrada");
    }

    return prisma.machine.update({
      where: { id: request.params.id },
      data: { machineStatus, lastStatusChangedAt: new Date() },
      select: machineSelect,
    });
  });

  app.patch<{ Params: { id: string }; Body: ProductionModeBody }>("/api/machines/:id/production-mode", async (request, reply) => {
    const productionMode = requiredBodyString(request.body?.productionMode);
    if (!productionMode || !PRODUCTION_MODES.has(productionMode)) {
      return badRequest(reply, "Modo de produção inválido");
    }

    const machine = await prisma.machine.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!machine) {
      return notFound(reply, "Máquina não encontrada");
    }

    return prisma.machine.update({
      where: { id: request.params.id },
      data: { productionMode },
      select: machineSelect,
    });
  });
}
