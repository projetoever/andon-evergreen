import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { notFound } from "./routeUtils.js";

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
}
