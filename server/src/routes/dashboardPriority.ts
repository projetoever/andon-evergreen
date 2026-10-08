import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { lockMachinePriorityFlow } from "../db/priorityFlowLock.js";
import { prisma } from "../db/prisma.js";
import {
  buildCurrentPrioritySnapshot,
  buildPrioritySnapshot,
  diffPrioritySnapshots,
} from "../domain/machinePriorityHistory.js";
import { hashCredential, verifyCredential } from "../security/technicianCredentials.js";
import { badRequest } from "./routeUtils.js";

const GLOBAL_PRIORITY_CONFIG_ID = "global";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;

class PriorityCatalogChangedError extends Error {}

type PrioritySession = {
  username: string;
  expiresAt: number;
};

const sessions = new Map<string, PrioritySession>();

type CredentialsBody = {
  username?: unknown;
  password?: unknown;
};

type OrderBody = {
  machineIds?: unknown;
};

function normalizeUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= MIN_USERNAME_LENGTH && normalized.length <= 80
    ? normalized
    : null;
}

function normalizePassword(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= MIN_PASSWORD_LENGTH && normalized.length <= 128
    ? normalized
    : null;
}

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function getPrioritySession(request: FastifyRequest, reply: FastifyReply) {
  const token = getBearerToken(request);
  if (!token) {
    reply.status(401).send({
      error: "priority_auth_required",
      message: "Autenticação de prioridades necessária.",
    });
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(token);
    reply.status(401).send({
      error: "priority_session_expired",
      message: "Sessão de prioridades expirada. Entre novamente.",
    });
    return null;
  }

  return { token, session };
}

function machineOrderValue(machine: {
  priorityOrder: number | null;
  displayOrder: number | null;
  id: string;
}) {
  if (machine.priorityOrder != null) return machine.priorityOrder;
  if (machine.displayOrder != null) return machine.displayOrder;
  const numericId = Number(machine.id);
  return Number.isFinite(numericId) ? numericId : Number.MAX_SAFE_INTEGER;
}

export function registerDashboardPriorityRoutes(app: FastifyInstance) {
  app.get("/api/dashboard-priority/access-status", async () => {
    const config = await prisma.dashboardPriorityConfig.findUnique({
      where: { id: GLOBAL_PRIORITY_CONFIG_ID },
      select: {
        managerUsername: true,
        managerPasswordHash: true,
        lastOrderUpdatedAt: true,
        lastOrderUpdatedBy: true,
      },
    });

    return {
      configured: Boolean(config?.managerUsername && config?.managerPasswordHash),
      username: config?.managerUsername ?? null,
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
    };
  });

  app.put<{ Body: CredentialsBody }>(
    "/api/dashboard-priority/credentials",
    async (request, reply) => {
      const username = normalizeUsername(request.body?.username);
      const password = normalizePassword(request.body?.password);

      if (!username) {
        return badRequest(
          reply,
          `Usuário deve possuir entre ${MIN_USERNAME_LENGTH} e 80 caracteres`,
        );
      }
      if (!password) {
        return badRequest(
          reply,
          `Senha deve possuir entre ${MIN_PASSWORD_LENGTH} e 128 caracteres`,
        );
      }

      const managerPasswordHash = await hashCredential(password);
      await prisma.dashboardPriorityConfig.upsert({
        where: { id: GLOBAL_PRIORITY_CONFIG_ID },
        update: {
          managerUsername: username,
          managerPasswordHash,
        },
        create: {
          id: GLOBAL_PRIORITY_CONFIG_ID,
          managerUsername: username,
          managerPasswordHash,
        },
      });

      sessions.clear();

      return {
        configured: true,
        username,
      };
    },
  );

  app.post<{ Body: CredentialsBody }>(
    "/api/dashboard-priority/login",
    async (request, reply) => {
      const username = normalizeUsername(request.body?.username);
      const password = normalizePassword(request.body?.password);

      if (!username || !password) {
        return reply.status(401).send({
          error: "priority_invalid_credentials",
          message: "Usuário ou senha inválidos.",
        });
      }

      const config = await prisma.dashboardPriorityConfig.findUnique({
        where: { id: GLOBAL_PRIORITY_CONFIG_ID },
        select: {
          managerUsername: true,
          managerPasswordHash: true,
        },
      });

      const valid =
        config?.managerUsername === username &&
        (await verifyCredential(password, config.managerPasswordHash));

      if (!valid) {
        return reply.status(401).send({
          error: "priority_invalid_credentials",
          message: "Usuário ou senha inválidos.",
        });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = Date.now() + SESSION_TTL_MS;
      sessions.set(token, { username, expiresAt });

      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        username,
      };
    },
  );

  app.post("/api/dashboard-priority/logout", async (request, reply) => {
    const auth = getPrioritySession(request, reply);
    if (!auth) return;
    sessions.delete(auth.token);
    return { ok: true };
  });

  app.get("/api/dashboard-priority/order", async (request, reply) => {
    const auth = getPrioritySession(request, reply);
    if (!auth) return;

    const [machines, config] = await Promise.all([
      prisma.machine.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
          priorityOrder: true,
          displayOrder: true,
        },
      }),
      prisma.dashboardPriorityConfig.findUnique({
        where: { id: GLOBAL_PRIORITY_CONFIG_ID },
        select: {
          lastOrderUpdatedAt: true,
          lastOrderUpdatedBy: true,
        },
      }),
    ]);

    machines.sort(
      (current, next) =>
        machineOrderValue(current) - machineOrderValue(next) ||
        current.id.localeCompare(next.id, "pt-BR", { numeric: true }),
    );

    return {
      machines,
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
    };
  });

  app.put<{ Body: OrderBody }>("/api/dashboard-priority/order", async (request, reply) => {
    const auth = getPrioritySession(request, reply);
    if (!auth) return;

    if (!Array.isArray(request.body?.machineIds)) {
      return badRequest(reply, "Informe a sequência completa de máquinas.");
    }

    const machineIds = request.body.machineIds;
    if (
      machineIds.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(machineIds).size !== machineIds.length
    ) {
      return badRequest(reply, "A sequência contém IDs inválidos ou duplicados.");
    }

    const normalizedIds = machineIds.map((id) => id.trim());

    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockMachinePriorityFlow(tx);

        const currentMachines = await tx.machine.findMany({
          select: {
            id: true,
            isActive: true,
            priorityOrder: true,
            displayOrder: true,
          },
        });
        const currentIds = new Set(currentMachines.map((machine) => machine.id));

        if (
          normalizedIds.length !== currentIds.size ||
          normalizedIds.some((id) => !currentIds.has(id))
        ) {
          throw new PriorityCatalogChangedError(
            "O cadastro de máquinas mudou durante a edição. Recarregue a lista antes de salvar.",
          );
        }

        const currentById = new Map(
          currentMachines.map((machine) => [machine.id, machine]),
        );
        const previousSnapshot = buildCurrentPrioritySnapshot(currentMachines);
        const nextSnapshot = buildPrioritySnapshot(normalizedIds, currentById);
        const priorityChanges = diffPrioritySnapshots(
          normalizedIds,
          previousSnapshot,
          nextSnapshot,
        );

        const updatedAt = new Date();

        for (const [index, id] of normalizedIds.entries()) {
          await tx.machine.update({
            where: { id },
            data: { priorityOrder: index + 1 },
          });
        }

        for (const change of priorityChanges) {
          await tx.machinePriorityHistory.create({
            data: {
              machineId: change.machineId,
              previousOrder: change.previousOrder,
              newOrder: change.newOrder,
              previousPriorityRank: change.previousPriorityRank,
              newPriorityRank: change.newPriorityRank,
              changedAt: updatedAt,
              changedBy: auth.session.username,
              source: "priority_manager",
            },
          });
        }

        await tx.dashboardPriorityConfig.upsert({
          where: { id: GLOBAL_PRIORITY_CONFIG_ID },
          update: {
            lastOrderUpdatedAt: updatedAt,
            lastOrderUpdatedBy: auth.session.username,
          },
          create: {
            id: GLOBAL_PRIORITY_CONFIG_ID,
            lastOrderUpdatedAt: updatedAt,
            lastOrderUpdatedBy: auth.session.username,
          },
        });

        return {
          updatedAt,
          updatedBy: auth.session.username,
        };
      });

      return {
        ok: true,
        lastOrderUpdatedAt: result.updatedAt,
        lastOrderUpdatedBy: result.updatedBy,
      };
    } catch (error) {
      if (error instanceof PriorityCatalogChangedError) {
        return reply.status(409).send({
          error: "priority_machine_catalog_changed",
          message: error.message,
        });
      }
      throw error;
    }
  });

}
