import type { FastifyInstance } from "fastify";

import { prisma } from "../db/prisma.js";
import { appendAudit } from "../access/audit.js";
import { readAdminSession } from "../security/adminAuthorization.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { badRequest, notFound, parseBoolean } from "./routeUtils.js";
import { ACCESS_COOKIE, centralAccessEnabled, readSecureCookie } from "../access/http.js";
import { AccessError } from "../access/policy.js";
import { isAuthorizedCentralOwnWorkstationPreference } from "../security/centralOwnWorkstationPrefsHttp.js";
import { runCentralOwnWorkstationPreference } from "../access/centralOwnWorkstationPrefs.js";

type RegisterWorkstationBody = { id?: unknown };
type UpdateWorkstationBody = {
  name?: unknown;
  active?: unknown;
  allowOperational?: unknown;
  allowBi?: unknown;
  allowPriorities?: unknown;
};
type ScreenLockBody = { machineId?: unknown };
type MachineSoundPreferenceBody = { enabled?: unknown };

class WorkstationUpdateValidationError extends Error {}

const workstationSelect = {
  id: true,
  name: true,
  active: true,
  pendingApproval: true,
  allowOperational: true,
  allowBi: true,
  allowPriorities: true,
  lastIpAddress: true,
  lastSeenAt: true,
  createdAt: true,
  lockedMachineId: true,
  updatedAt: true,
};

export async function registerWorkstationRoutes(app: FastifyInstance) {
  app.post<{ Body: RegisterWorkstationBody }>(
    "/api/workstations/register",
    async (request, reply) => {
      const id = parseWorkstationId(request.body?.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");

      const now = new Date();
      const lastIpAddress = request.ip.replace(/^::ffff:/, "");
      const workstation = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('andon-enrollment-policy'))::text`;
        const policy = await tx.systemSettings.findUnique({
          where: { id: "global" },
          select: { requireWorkstationApproval: true },
        });
        const pendingApproval = policy?.requireWorkstationApproval ?? false;
        return tx.workstation.upsert({
          where: { id },
          create: {
            id,
            active: !pendingApproval,
            pendingApproval,
            // Preserve the legacy module defaults. A pending workstation is still
            // denied by `active`/`pendingApproval`; central approval replaces
            // these defaults with the administrator's explicit module choices.
            allowOperational: true,
            allowBi: true,
            allowPriorities: true,
            lastSeenAt: now,
            lastIpAddress,
          },
          update: { lastSeenAt: now, lastIpAddress },
          select: workstationSelect,
        });
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

  app.get<{ Params: { id: string } }>(
    "/api/workstations/:id/runtime-preferences",
    async (request, reply) => {
      const id = parseWorkstationId(request.params.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");

      const workstation = await prisma.workstation.findUnique({
        where: { id },
        select: {
          id: true,
          active: true,
          lockedMachineId: true,
          soundPreferences: {
            select: {
              machineId: true,
              enabled: true,
            },
          },
        },
      });
      if (!workstation) return notFound(reply, "Workstation não encontrada");

      return {
        workstationId: workstation.id,
        active: workstation.active,
        lockedMachineId: workstation.lockedMachineId,
        machineSoundPreferences: Object.fromEntries(
          workstation.soundPreferences.map((item) => [item.machineId, item.enabled]),
        ),
      };
    },
  );

  app.patch<{ Params: { id: string }; Body: ScreenLockBody }>(
    "/api/workstations/:id/screen-lock",
    async (request, reply) => {
      if (centralAccessEnabled()) {
        if (!isAuthorizedCentralOwnWorkstationPreference(request))
          throw new AccessError("central_action_not_supported");
        const body = request.body ?? {};
        if (Object.keys(body).some(key => key !== "machineId") ||
            !(body.machineId === null ||
              (typeof body.machineId === "string" && body.machineId.trim())))
          return reply.status(400).send({ error: "invalid_input" });
        try {
          return await runCentralOwnWorkstationPreference(prisma, {
            token: readSecureCookie(request, ACCESS_COOKIE),
            workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
            targetWorkstationId: request.params.id,
            change: { type: "screen-lock",
              machineId: body.machineId === null ? null : String(body.machineId).trim() },
            requestId: request.id, ipAddress: request.ip.replace(/^::ffff:/, ""),
          });
        } catch (error) {
          if (error instanceof AccessError)
            return reply.status(error.statusCode).send({ error: error.code });
          throw error;
        }
      }
      const id = parseWorkstationId(request.params.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");

      const rawMachineId = request.body?.machineId;
      const machineId =
        rawMachineId === null
          ? null
          : typeof rawMachineId === "string" && rawMachineId.trim()
            ? rawMachineId.trim()
            : undefined;
      if (machineId === undefined) {
        return badRequest(reply, "Informe machineId válido ou null para desbloquear");
      }

      return prisma.$transaction(async (tx) => {
        await lockWorkstationFlow(tx, id);

        const workstation = await tx.workstation.findUnique({
          where: { id },
          select: { id: true, active: true },
        });
        if (!workstation) return notFound(reply, "Workstation não encontrada");
        if (!workstation.active) return badRequest(reply, "Workstation desativada");

        if (machineId) {
          const machine = await tx.machine.findUnique({
            where: { id: machineId },
            select: { id: true, isActive: true },
          });
          if (!machine?.isActive) return badRequest(reply, "Máquina inválida ou inativa");
        }

        await tx.workstation.update({
          where: { id },
          data: { lockedMachineId: machineId },
        });

        return {
          workstationId: id,
          lockedMachineId: machineId,
        };
      });
    },
  );

  app.put<{ Params: { id: string; machineId: string }; Body: MachineSoundPreferenceBody }>(
    "/api/workstations/:id/machine-sound/:machineId",
    async (request, reply) => {
      if (centralAccessEnabled()) {
        if (!isAuthorizedCentralOwnWorkstationPreference(request))
          throw new AccessError("central_action_not_supported");
        const body = request.body ?? {};
        if (Object.keys(body).some(key => key !== "enabled") ||
            typeof body.enabled !== "boolean")
          return reply.status(400).send({ error: "invalid_input" });
        try {
          return await runCentralOwnWorkstationPreference(prisma, {
            token: readSecureCookie(request, ACCESS_COOKIE),
            workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? "",
            targetWorkstationId: request.params.id,
            change: { type: "machine-sound", machineId: request.params.machineId,
              enabled: body.enabled },
            requestId: request.id, ipAddress: request.ip.replace(/^::ffff:/, ""),
          });
        } catch (error) {
          if (error instanceof AccessError)
            return reply.status(error.statusCode).send({ error: error.code });
          throw error;
        }
      }
      const id = parseWorkstationId(request.params.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");
      const machineId = request.params.machineId.trim();
      if (!machineId) return badRequest(reply, "Máquina inválida");
      if (typeof request.body?.enabled !== "boolean") {
        return badRequest(reply, "Campo enabled deve ser booleano");
      }

      const [workstation, machine] = await Promise.all([
        prisma.workstation.findUnique({ where: { id }, select: { id: true, active: true } }),
        prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } }),
      ]);
      if (!workstation) return notFound(reply, "Workstation não encontrada");
      if (!workstation.active) return badRequest(reply, "Workstation desativada");
      if (!machine) return notFound(reply, "Máquina não encontrada");

      const preference = await prisma.workstationMachineSoundPreference.upsert({
        where: {
          workstationId_machineId: {
            workstationId: id,
            machineId,
          },
        },
        create: {
          workstationId: id,
          machineId,
          enabled: request.body.enabled,
        },
        update: {
          enabled: request.body.enabled,
        },
        select: {
          machineId: true,
          enabled: true,
          updatedAt: true,
        },
      });

      return {
        workstationId: id,
        ...preference,
      };
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateWorkstationBody }>(
    "/api/workstations/:id",
    async (request, reply) => {
      const id = parseWorkstationId(request.params.id);
      if (!id) return badRequest(reply, "Identificador de workstation inválido");
      // Defense in depth: do not rely only on the global Admin preHandler.
      // A legacy administrator remains distinguishable from a central user.
      const admin = readAdminSession(request);
      if (!admin) return reply.status(401).send({ error: "admin_auth_required" });

      const hasName = Object.prototype.hasOwnProperty.call(request.body ?? {}, "name");
      const hasActive = Object.prototype.hasOwnProperty.call(request.body ?? {}, "active");
      const hasOperational = Object.prototype.hasOwnProperty.call(
        request.body ?? {},
        "allowOperational",
      );
      const hasBi = Object.prototype.hasOwnProperty.call(request.body ?? {}, "allowBi");
      const hasPriorities = Object.prototype.hasOwnProperty.call(
        request.body ?? {},
        "allowPriorities",
      );
      if (!hasName && !hasActive && !hasOperational && !hasBi && !hasPriorities)
        return badRequest(reply, "Nenhuma alteração informada");
      if (
        (hasOperational && typeof request.body.allowOperational !== "boolean") ||
        (hasBi && typeof request.body.allowBi !== "boolean") ||
        (hasPriorities && typeof request.body.allowPriorities !== "boolean")
      ) {
        return badRequest(reply, "Permissões de módulos devem ser booleanas");
      }
      const allowOperational = hasOperational
        ? (request.body.allowOperational as boolean)
        : undefined;
      const allowBi = hasBi ? (request.body.allowBi as boolean) : undefined;
      const allowPriorities = hasPriorities ? (request.body.allowPriorities as boolean) : undefined;

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
      if (
        active === false &&
        parseWorkstationId(request.headers["x-andon-workstation-id"]) === id
      ) {
        return badRequest(reply, "Não é possível desativar a própria workstation administrativa.");
      }

      const existing = await prisma.workstation.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return notFound(reply, "Workstation não encontrada");

      try {
        return await prisma.$transaction(async (tx) => {
          await lockWorkstationFlow(tx, id);

          const lockedWorkstation = await tx.workstation.findUnique({
            where: { id },
            select: {
              id: true,
              name: true,
              active: true,
              pendingApproval: true,
              allowOperational: true,
              allowBi: true,
              allowPriorities: true,
              lockedMachineId: true,
              admission: { select: { status: true } },
            },
          });
          if (!lockedWorkstation) {
            throw new WorkstationUpdateValidationError("Workstation não encontrada");
          }
          // With central access OFF, the legacy Admin is the authorized
          // approver for registration-policy pending workstations. Preserve
          // that established flow, but make its decision explicit/auditable.
          // A previously rejected central admission cannot be overridden.
          if (active === true && lockedWorkstation.admission?.status === "rejected") {
            throw new WorkstationUpdateValidationError(
              "Admissão rejeitada: solicite uma nova aprovação da workstation.",
            );
          }
          if (
            lockedWorkstation.pendingApproval && active !== true &&
            (allowOperational !== undefined || allowBi !== undefined ||
             allowPriorities !== undefined)
          ) {
            throw new WorkstationUpdateValidationError(
              "A workstation está aguardando aprovação para liberar módulos.",
            );
          }
          const approvingLegacyAdmission = active === true && lockedWorkstation.pendingApproval;

          if (
            (allowOperational === false || active === false) &&
            lockedWorkstation.lockedMachineId
          ) {
            throw new WorkstationUpdateValidationError(
              "Desbloqueie a tela da máquina antes de retirar o acesso operacional.",
            );
          }

          if ((active === false && lockedWorkstation.active) || allowOperational === false) {
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
                "Não é possível desativar ou retirar acesso operacional de workstation com atendimento ativo.",
              );
            }
          }

          const updated = await tx.workstation.update({
            where: { id },
            data: {
              ...(hasName ? { name } : {}),
              ...(active !== undefined
                ? { active, ...(approvingLegacyAdmission ? { pendingApproval: false } : {}) }
                : {}),
              ...(allowOperational !== undefined ? { allowOperational } : {}),
              ...(allowBi !== undefined ? { allowBi } : {}),
              ...(allowPriorities !== undefined ? { allowPriorities } : {}),
            },
            select: workstationSelect,
          });
          if (approvingLegacyAdmission && lockedWorkstation.admission?.status === "pending") {
            await tx.workstationAdmission.update({
              where: { workstationId: id },
              data: {
                status: "approved",
                decidedAt: new Date(),
                decisionReason: "Aprovada por Admin legado autenticado",
                decidedByUserId: null,
              },
            });
          }
          // Keep session revocation consistent with the central Admin route.
          // This update and the audit must succeed in the SAME transaction.
          if (active === false) {
            await tx.accessSession.updateMany({
              where: { workstationId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          }
          await appendAudit(tx, {
            actorType: "legacy_admin",
            actorLogin: admin.session.username,
            workstationId: parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? undefined,
            ipAddress: request.ip,
            requestId: request.id,
          }, {
            action: approvingLegacyAdmission
              ? "workstation.admission.approved"
              : "workstation.access.updated",
            resourceType: "workstation",
            resourceId: id,
            before: {
              name: lockedWorkstation.name,
              active: lockedWorkstation.active,
              pendingApproval: lockedWorkstation.pendingApproval,
              allowOperational: lockedWorkstation.allowOperational,
              allowBi: lockedWorkstation.allowBi,
              allowPriorities: lockedWorkstation.allowPriorities,
            },
            after: {
              name: updated.name,
              active: updated.active,
              pendingApproval: updated.pendingApproval,
              allowOperational: updated.allowOperational,
              allowBi: updated.allowBi,
              allowPriorities: updated.allowPriorities,
            },
          });
          return updated;
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
