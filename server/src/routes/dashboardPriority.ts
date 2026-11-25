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
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { scopedMachineReadIds } from "../security/centralScopedMachineReads.js";
import { centralAccessEnabled, ACCESS_COOKIE, readSecureCookie } from "../access/http.js";
import { AccessError } from "../access/policy.js";
import { isAuthorizedCentralPriorityRequest } from "../security/centralPriorityHttp.js";
import { runCentralPriorityOrderWrite } from "../access/centralPriorityOrderWrite.js";

const GLOBAL_PRIORITY_CONFIG_ID = "global";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 6;

class PriorityCatalogChangedError extends Error {}
class PriorityOrderChangedError extends Error {}
class PriorityHighlightChangedError extends Error {}
class PriorityHighlightRangeError extends Error {}

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
  expectedMachineIds?: unknown;
  priorityHighlightCount?: unknown;
  expectedPriorityHighlightCount?: unknown;
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

async function getPrioritySession(request: FastifyRequest, reply: FastifyReply) {
  if (centralAccessEnabled()) {
    sessions.clear();
    reply.status(403).header("Cache-Control", "no-store")
      .send({ error: "legacy_priority_session_disabled" });
    return null;
  }
  const policy = await prisma.dashboardPriorityConfig.findUnique({ where: { id: GLOBAL_PRIORITY_CONFIG_ID }, select: { passwordRequired: true } });
  if (policy?.passwordRequired === false) {
    const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
    if (!id) {
      reply.status(403).send({ error: "workstation_identification_required", message: "Identifique a workstation para usar Prioridades sem senha." });
      return null;
    }
    return { token: null, session: { username: `workstation:${id}`, expiresAt: Date.now() + SESSION_TTL_MS } };
  }
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
  app.patch<{ Body: { passwordRequired?: unknown } }>("/api/dashboard-priority/access-policy", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (centralAccessEnabled())
      return reply.status(403).send({ error: "legacy_priority_credentials_disabled" });
    if (typeof request.body?.passwordRequired !== "boolean") return badRequest(reply, "Informe se Prioridades exige senha.");
    const config = await prisma.dashboardPriorityConfig.findUnique({ where: { id: GLOBAL_PRIORITY_CONFIG_ID } });
    if (request.body.passwordRequired && (!config?.managerUsername || !config.managerPasswordHash)) return badRequest(reply, "Configure as credenciais de Prioridades antes de exigir senha.");
    const saved = await prisma.dashboardPriorityConfig.upsert({
      where: { id: GLOBAL_PRIORITY_CONFIG_ID },
      create: { id: GLOBAL_PRIORITY_CONFIG_ID, passwordRequired: request.body.passwordRequired },
      update: { passwordRequired: request.body.passwordRequired },
      select: { passwordRequired: true },
    });
    sessions.clear();
    return saved;
  });
  app.get("/api/dashboard-priority/access-status", async () => {
    const config = await prisma.dashboardPriorityConfig.findUnique({
      where: { id: GLOBAL_PRIORITY_CONFIG_ID },
      select: {
        managerUsername: true,
        managerPasswordHash: true,
        passwordRequired: true,
        lastOrderUpdatedAt: true,
        lastOrderUpdatedBy: true,
      },
    });

    return {
      configured: Boolean(config?.managerUsername && config?.managerPasswordHash),
      passwordRequired: config?.passwordRequired ?? true,
      username: config?.managerUsername ?? null,
      lastOrderUpdatedAt: config?.lastOrderUpdatedAt ?? null,
      lastOrderUpdatedBy: config?.lastOrderUpdatedBy ?? null,
    };
  });

  app.put<{ Body: CredentialsBody }>(
    "/api/dashboard-priority/credentials",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (centralAccessEnabled())
        return reply.status(403).send({ error: "legacy_priority_credentials_disabled" });
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
      reply.header("Cache-Control", "no-store");
      if (centralAccessEnabled()) {
        sessions.clear();
        return reply.status(403).send({ error: "legacy_priority_login_disabled" });
      }
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
    const auth = await getPrioritySession(request, reply);
    if (!auth) return;
    if (auth.token) sessions.delete(auth.token);
    return { ok: true };
  });

  app.get("/api/dashboard-priority/order", async (request, reply) => {
    const allowedIds = scopedMachineReadIds(request);
    // Scoped context exists ONLY after the global workstation hook has
    // validated the central cookie, HTTPS, origin, station and priorities.read.
    // Access without that hook fails closed in scopedMachineReadIds above.
    // In central mode, a read does not need a second legacy password.
    // PUT still fails closed before reaching this router.
    if (!centralAccessEnabled()) {
      const auth = await getPrioritySession(request, reply);
      if (!auth) return;
    }

    const [machines, config] = await Promise.all([
      prisma.machine.findMany({
        where: allowedIds === null ? undefined : { id: { in: [...allowedIds] } },
        select: {
          id: true,
          name: true,
          isActive: true,
          priorityOrder: true,
          displayOrder: true,
          productionMode: true,
        },
      }),
      prisma.dashboardPriorityConfig.findUnique({
        where: { id: GLOBAL_PRIORITY_CONFIG_ID },
        select: {
          lastOrderUpdatedAt: true,
          lastOrderUpdatedBy: true,
          priorityHighlightCount: true,
        },
      }),
    ]);

    // Production mode comes from the authoritative Machine record. Read only
    // event timestamps for machines already returned by scoped SQL. Missing
    // or inconsistent events MUST NOT be replaced with Machine.updatedAt.
    const events = machines.length
      ? await prisma.machineProductionEvent.findMany({
          where: {
            machineId: { in: machines.map((machine) => machine.id) },
            endedAt: null,
          },
          orderBy: { startedAt: "desc" },
          select: { machineId: true, productionMode: true, startedAt: true },
        })
      : [];
    const currentProductionEvent = new Map<string, { productionMode: string; startedAt: Date }>();
    for (const event of events)
      if (!currentProductionEvent.has(event.machineId))
        currentProductionEvent.set(event.machineId, event);

    machines.sort(
      (current, next) =>
        machineOrderValue(current) - machineOrderValue(next) ||
        current.id.localeCompare(next.id, "pt-BR", { numeric: true }),
    );

    return {
      machines: machines.map((machine) => ({
        ...machine,
        productionMode: machine.productionMode === "scheduled" || machine.productionMode === "not_scheduled"
          ? machine.productionMode : null,
        productionModeChangedAt:
          currentProductionEvent.get(machine.id)?.productionMode === machine.productionMode
            ? currentProductionEvent.get(machine.id)?.startedAt.toISOString() ?? null
            : null,
      })),
      // Global change attribution must not leak activity on inaccessible assets.
      lastOrderUpdatedAt: allowedIds === null ? (config?.lastOrderUpdatedAt ?? null) : null,
      lastOrderUpdatedBy: allowedIds === null ? (config?.lastOrderUpdatedBy ?? null) : null,
      priorityHighlightCount: config?.priorityHighlightCount ?? 5,
    };
  });

  app.get("/api/dashboard-priority/history", async (request, reply) => {
    // Only requests bound by the validated central workstation hook can
    // resolve a machine scope. Legacy access requires its own Priority session.
    const allowedIds = scopedMachineReadIds(request);
    if (!centralAccessEnabled()) {
      const auth = await getPrioritySession(request, reply);
      if (!auth) return;
    }
    const records = await prisma.machinePriorityHistory.findMany({
      where: allowedIds === null ? undefined : { machineId: { in: [...allowedIds] } },
      select: {
        id: true, machineId: true, changedAt: true, changedBy: true,
        previousOrder: true, newOrder: true,
        previousPriorityRank: true, newPriorityRank: true,
      },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      take: 101,
    });
    return {
      entries: records.slice(0, 100).map((entry) => ({
        ...entry,
        // Do not disclose global editor attribution to a selected-scope reader.
        changedBy: allowedIds === null ? entry.changedBy : null,
      })),
      truncated: records.length > 100,
    };
  });

  app.put<{ Body: OrderBody }>("/api/dashboard-priority/order", async (request, reply) => {
    if (centralAccessEnabled()) {
      if (!isAuthorizedCentralPriorityRequest(request))
        throw new AccessError("central_action_not_supported");
      try {
        return await runCentralPriorityOrderWrite(prisma, {
          token: readSecureCookie(request, ACCESS_COOKIE),
          workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
          machineIds: request.body?.machineIds,
          expectedMachineIds: request.body?.expectedMachineIds,
          priorityHighlightCount: request.body?.priorityHighlightCount,
          expectedPriorityHighlightCount: request.body?.expectedPriorityHighlightCount,
          requestId: request.id, ipAddress: request.ip.replace(/^::ffff:/, ""),
        });
      } catch (error) {
        if (error instanceof AccessError)
          return reply.status(error.statusCode).send({ error: error.code });
        throw error;
      }
    }
    const auth = await getPrioritySession(request, reply);
    if (!auth) return;

    if (!Array.isArray(request.body?.machineIds)) {
      return badRequest(reply, "Informe a sequência completa de máquinas.");
    }

    const machineIds = request.body.machineIds;
    const expectedMachineIds = request.body.expectedMachineIds;
    const isHighlightChange = request.body.priorityHighlightCount !== undefined;
    if (isHighlightChange && (typeof request.body.priorityHighlightCount !== "number" ||
        !Number.isInteger(request.body.priorityHighlightCount) ||
        Number(request.body.priorityHighlightCount) < 1 ||
        Number(request.body.priorityHighlightCount) > 1000 ||
        typeof request.body.expectedPriorityHighlightCount !== "number" ||
        !Number.isInteger(request.body.expectedPriorityHighlightCount)))
      return badRequest(reply, "Quantidade de destaques inválida.");
    if (!Array.isArray(expectedMachineIds) || expectedMachineIds.length > 1000 ||
        expectedMachineIds.some((id) => typeof id !== "string" || !id.trim() || id.length > 120) ||
        new Set(expectedMachineIds).size !== expectedMachineIds.length)
      return badRequest(reply, "Informe a sequência original para verificar edições concorrentes.");
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
        const config = await tx.dashboardPriorityConfig.findUnique({
          where: { id: GLOBAL_PRIORITY_CONFIG_ID }, select: { priorityHighlightCount: true },
        });
        const oldCount = config?.priorityHighlightCount ?? 5;
        const newCount = isHighlightChange ? Number(request.body.priorityHighlightCount) : oldCount;
        if (isHighlightChange && Number(request.body.expectedPriorityHighlightCount) !== oldCount)
          throw new PriorityHighlightChangedError("A quantidade de destaques mudou em outra estação. Recarregue.");
        if (isHighlightChange && newCount > currentMachines.filter((machine) => machine.isActive).length)
          throw new PriorityHighlightRangeError("A quantidade deve estar entre 1 e o número de máquinas ativas.");
        const previousSnapshot = buildCurrentPrioritySnapshot(currentMachines, oldCount);
        if (expectedMachineIds.length !== previousSnapshot.orderedIds.length ||
            expectedMachineIds.some((id, index) => id !== previousSnapshot.orderedIds[index]))
          throw new PriorityOrderChangedError(
            "A sequência foi alterada em outra estação. Recarregue antes de salvar.",
          );
        const nextSnapshot = buildPrioritySnapshot(normalizedIds, currentById, newCount);
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
            ...(isHighlightChange ? { priorityHighlightCount: newCount } : {}),
          },
          create: {
            id: GLOBAL_PRIORITY_CONFIG_ID,
            lastOrderUpdatedAt: updatedAt,
            lastOrderUpdatedBy: auth.session.username,
            priorityHighlightCount: newCount,
          },
        });

        return {
          updatedAt,
          updatedBy: auth.session.username,
          priorityHighlightCount: newCount,
        };
      });

      return {
        ok: true,
        lastOrderUpdatedAt: result.updatedAt,
        lastOrderUpdatedBy: result.updatedBy,
        priorityHighlightCount: result.priorityHighlightCount,
      };
    } catch (error) {
      if (error instanceof PriorityHighlightChangedError)
        return reply.status(409).send({ error: "priority_highlight_changed", message: error.message });
      if (error instanceof PriorityHighlightRangeError)
        return reply.status(409).send({ error: "priority_highlight_count_out_of_range", message: error.message });
      if (error instanceof PriorityOrderChangedError)
        return reply.status(409).send({ error: "priority_order_changed", message: error.message });
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
