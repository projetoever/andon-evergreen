import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";

type RegisterWorkstationBody = { id?: unknown };
type UpdateWorkstationBody = { name?: unknown; active?: unknown };

class WorkstationUpdateValidationError extends Error {}

const workstationSelect = {
  id: true,
  name: true,
  active: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
};

export async function registerWorkstationRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterWorkstationBody }>(
    "/api/workstations/register",
    async (request, reply) => {
      const id = parseWorkstationId(request.body?.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");

      const now = new Date();
      const workstation = await prisma.workstation.upsert({
        where: { id },
        create: { id, lastSeenAt: now },
        update: { lastSeenAt: now },
        select: workstationSelect,
      });

      return reply.status(200).send(workstation);
    },
  );

  app.get("/api/workstations", async () =>
    prisma.workstation.findMany({
      select: workstationSelect,
      orderBy: [{ active: "desc" }, { name: "asc" }, { lastSeenAt: "desc" }],
    }),
  );

  app.get<{ Params: { id: string } }>("/api/workstations/:id", async (request, reply) => {
    const id = parseWorkstationId(request.params.id);
    if (!id) return badRequest(reply, "Identificador de workstation inválido");

    const workstation = await prisma.workstation.findUnique({
      where: { id },
      select: workstationSelect,
    });
    if (!workstation) return notFound(reply, "Workstation não encontrada");
    return workstation;
  });

  app.patch<{ Params: { id: string }; Body: UpdateWorkstationBody }>(
    "/api/workstations/:id",
    async (request, reply) => {
      const id = parseWorkstationId(request.params.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");

      const hasName = Object.prototype.hasOwnProperty.call(request.body ?? {}, "name");
      const hasActive = Object.prototype.hasOwnProperty.call(request.body ?? {}, "active");
      if (!hasName && !hasActive) return badRequest(reply, "Nenhuma alteração informada");

      let name: string | null | undefined;
      if (hasName) {
        if (typeof request.body?.name !== "string") {
          return badRequest(reply, "Campo name deve ser texto");
        }
        const normalizedName = request.body.name.trim().replace(/\s+/g, " ");
        if (normalizedName.length > 120) {
          return badRequest(reply, "Nome da workstation deve ter no máximo 120 caracteres");
        }
        name = normalizedName || null;
      }

      const active = hasActive ? parseBoolean(request.body?.active) : undefined;
      if (hasActive && active === undefined) {
        return badRequest(reply, "Campo active deve ser booleano");
      }

      const existing = await prisma.workstation.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return notFound(reply, "Workstation não encontrada");

      try {
        return await prisma.$transaction(async (tx) => {
          await lockWorkstationFlow(tx, id);

          const lockedWorkstation = await tx.workstation.findUnique({
            where: { id },
            select: { id: true, active: true },
          });
          if (!lockedWorkstation) {
            throw new WorkstationUpdateValidationError("Workstation não encontrada");
          }

          if (active === false && lockedWorkstation.active) {
            const activeSession = await tx.technicianSession.findFirst({
              where: {
                workstationId: id,
                endedAt: null,
              },
              select: {
                id: true,
                callId: true,
                machineId: true,
              },
            });
            if (activeSession) {
              throw new WorkstationUpdateValidationError(
                "Não é possível desativar workstation com atendimento ativo.",
              );
            }
          }

          return tx.workstation.update({
            where: { id },
            data: {
              ...(hasName ? { name } : {}),
              ...(active !== undefined ? { active } : {}),
            },
            select: workstationSelect,
          });
        });
      } catch (error) {
        if (error instanceof WorkstationUpdateValidationError) {
          if (error.message === "Workstation não encontrada") {
            return notFound(reply, error.message);
          }
          return badRequest(reply, error.message);
        }
        throw error;
      }
    },
  );
}
