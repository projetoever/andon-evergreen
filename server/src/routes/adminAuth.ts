import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";

import { prisma } from "../db/prisma.js";
import { centralAccessEnabled } from "../access/http.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { describeMaintenanceStationAuthorization } from "../services/workstationCompletionDiagnostics.js";
import {
  createAdminSession,
  readAdminSession,
  revokeAdminSession,
} from "../security/adminAuthorization.js";
import { hashCredential, verifyCredential } from "../security/technicianCredentials.js";
import { badRequest } from "./routeUtils.js";
import { initializeGlobalAdminPassword, isLocalInitialAdminRequest, issueInitialAdminSetupToken, InitialAdminSetupError } from "../security/initialAdminSetup.js";

const GLOBAL_SETTINGS_ID = "global";
const ADMIN_USER = "admin";
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

type ChangePasswordBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
};

type RecoveryCodeBody = {
  currentPassword?: unknown;
};

type RecoverPasswordBody = {
  recoveryCode?: unknown;
  newPassword?: unknown;
};

function normalizePassword(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= MIN_PASSWORD_LENGTH && normalized.length <= MAX_PASSWORD_LENGTH
    ? normalized
    : null;
}

function normalizeRecoveryCode(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const normalized = compact.startsWith("ADM") ? compact.slice(3) : compact;
  return normalized.length === 12 ? normalized : null;
}

function formatRecoveryCode(raw: string) {
  return `ADM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function getAdminCredentialState() {
  return prisma.systemSettings.findUnique({
    where: { id: GLOBAL_SETTINGS_ID },
    select: {
      adminPasswordHash: true,
      adminRecoveryCodeHash: true,
      adminRecoveryCodeIssuedAt: true,
    },
  });
}

export async function verifyAdminPassword(password: string) {
  const settings = await getAdminCredentialState();
  if (!settings?.adminPasswordHash) {
    return false; // A fresh installation never accepts a factory password.
  }
  return verifyCredential(password, settings.adminPasswordHash);
}

async function saveAdminPassword(password: string) {
  const adminPasswordHash = await hashCredential(password);
  await prisma.systemSettings.upsert({
    where: { id: GLOBAL_SETTINGS_ID },
    update: { adminPasswordHash },
    create: { id: GLOBAL_SETTINGS_ID, adminPasswordHash },
  });
}

function invalidCredentials(reply: FastifyReply) {
  return reply.status(401).send({
    error: "admin_invalid_credentials",
    message: "Usuário ou senha inválidos.",
  });
}

export function registerAdminAuthRoutes(app: FastifyInstance) {
  // Read-only for the legacy Admin while central administration is not yet
  // authorized for this endpoint. Never exposes full workstation UUIDs.
  app.get<{ Querystring: { callId?: string } }>(
    "/api/admin-auth/workstation-attendance-diagnostic",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (centralAccessEnabled()) {
        return reply.status(403).send({ error: "central_admin_integration_pending" });
      }
      if (!readAdminSession(request)) {
        return reply.status(401).send({ error: "admin_auth_required" });
      }
      const callId = request.query.callId?.trim();
      if (!callId || !/^[a-zA-Z0-9_-]{4,120}$/.test(callId)) {
        return badRequest(reply, "Identificador de chamado inválido.");
      }
      const currentStationId = parseWorkstationId(request.headers["x-andon-workstation-id"]) ?? null;
      const [call, settings, station] = await Promise.all([
        prisma.andonCall.findUnique({
          where: { id: callId },
          select: {
            id: true, machineId: true, status: true, category: true,
            technicianSessions: {
              select: {
                workstationId: true, cycleIndex: true, endedAt: true, phase: true,
                workstation: { select: { name: true, active: true } },
              },
            },
          },
        }),
        prisma.systemSettings.findUnique({
          where: { id: GLOBAL_SETTINGS_ID },
          select: { restrictMaintenanceCompletionToAttendanceWorkstation: true },
        }),
        currentStationId
          ? prisma.workstation.findUnique({
              where: { id: currentStationId },
              select: { active: true },
            })
          : Promise.resolve(null),
      ]);
      if (!call) return reply.status(404).send({ error: "call_not_found" });
      if (call.category !== "maintenance") {
        return badRequest(reply, "Diagnóstico disponível para chamados de manutenção.");
      }
      const diagnostic = describeMaintenanceStationAuthorization(
        call.technicianSessions,
        currentStationId,
        station?.active ?? null,
        settings?.restrictMaintenanceCompletionToAttendanceWorkstation ?? false,
      );
      return {
        machineId: call.machineId,
        callIdSuffix: call.id.slice(-8),
        callStatus: call.status,
        ...diagnostic,
        outcome: call.status === "in_progress" ? diagnostic.outcome : "not_in_progress",
        advisoryOnly: true,
      };
    },
  );

  app.get("/api/admin-auth/status", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const settings = await getAdminCredentialState();
    const passwordConfigured = Boolean(settings?.adminPasswordHash);
    return {
      username: ADMIN_USER,
      passwordConfigured,
      setupAvailable: !passwordConfigured && isLocalInitialAdminRequest(request),
      ...(!passwordConfigured ? {
        setupToken: issueInitialAdminSetupToken(request),
      } : {}),
      recoveryConfigured: Boolean(settings?.adminRecoveryCodeHash),
      recoveryCodeIssuedAt: settings?.adminRecoveryCodeIssuedAt ?? null,
    };
  });

  app.post<{ Body: { setupToken?: unknown; password?: unknown } }>(
    "/api/admin-auth/initialize",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!request.body || typeof request.body !== "object" ||
          Array.isArray(request.body) ||
          Object.keys(request.body).some(key => !["setupToken", "password"].includes(key)))
        return reply.status(400).send({ error: "invalid_input" });
      try {
        return await initializeGlobalAdminPassword(prisma, request, request.body);
      } catch (error) {
        if (error instanceof InitialAdminSetupError)
          return reply.status(error.statusCode).send({ error: error.code });
        throw error;
      }
    },
  );

  app.post<{ Body: LoginBody }>("/api/admin-auth/login", async (request, reply) => {
    const username = typeof request.body?.username === "string" ? request.body.username.trim() : "";
    const password = normalizePassword(request.body?.password);

    if (username !== ADMIN_USER || !password || !(await verifyAdminPassword(password))) {
      return invalidCredentials(reply);
    }

    return { ok: true, ...createAdminSession(ADMIN_USER) };
  });

  app.put<{ Body: ChangePasswordBody }>("/api/admin-auth/password", async (request, reply) => {
    const currentPassword = normalizePassword(request.body?.currentPassword);
    const newPassword = normalizePassword(request.body?.newPassword);

    if (!currentPassword || !(await verifyAdminPassword(currentPassword))) {
      return reply.status(401).send({
        error: "admin_current_password_invalid",
        message: "Senha atual inválida.",
      });
    }

    if (!newPassword) {
      return badRequest(
        reply,
        `A nova senha deve possuir entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`,
      );
    }

    await saveAdminPassword(newPassword);

    return {
      ok: true,
      message: "Senha administrativa global alterada com sucesso.",
    };
  });

  app.post<{ Body: RecoveryCodeBody }>(
    "/api/admin-auth/recovery-code",
    async (request, reply) => {
      const currentPassword = normalizePassword(request.body?.currentPassword);

      if (!currentPassword || !(await verifyAdminPassword(currentPassword))) {
        return reply.status(401).send({
          error: "admin_current_password_invalid",
          message: "Senha administrativa atual inválida.",
        });
      }

      const rawCode = randomBytes(6).toString("hex").toUpperCase();
      const recoveryCode = formatRecoveryCode(rawCode);
      const adminRecoveryCodeHash = await hashCredential(rawCode);
      const issuedAt = new Date();

      await prisma.systemSettings.upsert({
        where: { id: GLOBAL_SETTINGS_ID },
        update: {
          adminRecoveryCodeHash,
          adminRecoveryCodeIssuedAt: issuedAt,
        },
        create: {
          id: GLOBAL_SETTINGS_ID,
          adminRecoveryCodeHash,
          adminRecoveryCodeIssuedAt: issuedAt,
        },
      });

      return {
        recoveryCode,
        issuedAt,
        message:
          "Código de recuperação gerado. Guarde-o fora do ANDON; ele não será exibido novamente.",
      };
    },
  );

  app.post<{ Body: RecoverPasswordBody }>("/api/admin-auth/recover", async (request, reply) => {
    const recoveryCode = normalizeRecoveryCode(request.body?.recoveryCode);
    const newPassword = normalizePassword(request.body?.newPassword);

    if (!recoveryCode || !newPassword) {
      return badRequest(reply, "Informe um código de recuperação válido e a nova senha.");
    }

    const settings = await getAdminCredentialState();
    const validRecoveryCode =
      settings?.adminRecoveryCodeHash &&
      (await verifyCredential(recoveryCode, settings.adminRecoveryCodeHash));

    if (!validRecoveryCode) {
      return reply.status(401).send({
        error: "admin_recovery_code_invalid",
        message: "Código de recuperação inválido.",
      });
    }

    const adminPasswordHash = await hashCredential(newPassword);
    await prisma.systemSettings.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      update: {
        adminPasswordHash,
        adminRecoveryCodeHash: null,
        adminRecoveryCodeIssuedAt: null,
      },
      create: {
        id: GLOBAL_SETTINGS_ID,
        adminPasswordHash,
      },
    });

    return {
      ok: true,
      ...createAdminSession(ADMIN_USER),
      message:
        "Senha administrativa redefinida. O código utilizado foi invalidado; gere um novo código no painel Admin.",
    };
  });

  app.post("/api/admin-auth/logout", async (request, reply) => {
    const auth = readAdminSession(request);
    if (!auth) {
      return reply.status(401).send({
        error: "admin_auth_required",
        message: "Sessão administrativa necessária.",
      });
    }

    revokeAdminSession(auth.token);
    return { ok: true };
  });
}
