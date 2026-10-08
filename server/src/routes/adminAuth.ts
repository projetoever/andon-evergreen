import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";

import { prisma } from "../db/prisma.js";
import { hashCredential, verifyCredential } from "../security/technicianCredentials.js";
import { badRequest } from "./routeUtils.js";

const GLOBAL_SETTINGS_ID = "global";
const ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASSWORD = "123456";
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
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length >= 12 && normalized.length <= 32 ? normalized : null;
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

async function verifyAdminPassword(password: string) {
  const settings = await getAdminCredentialState();
  if (!settings?.adminPasswordHash) {
    return password === DEFAULT_ADMIN_PASSWORD;
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
  app.get("/api/admin-auth/status", async () => {
    const settings = await getAdminCredentialState();
    return {
      username: ADMIN_USER,
      passwordConfigured: Boolean(settings?.adminPasswordHash),
      recoveryConfigured: Boolean(settings?.adminRecoveryCodeHash),
      recoveryCodeIssuedAt: settings?.adminRecoveryCodeIssuedAt ?? null,
    };
  });

  app.post<{ Body: LoginBody }>("/api/admin-auth/login", async (request, reply) => {
    const username = typeof request.body?.username === "string" ? request.body.username.trim() : "";
    const password = normalizePassword(request.body?.password);

    if (username !== ADMIN_USER || !password || !(await verifyAdminPassword(password))) {
      return invalidCredentials(reply);
    }

    return { ok: true, username: ADMIN_USER };
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
      username: ADMIN_USER,
      message:
        "Senha administrativa redefinida. O código utilizado foi invalidado; gere um novo código no painel Admin.",
    };
  });
}
