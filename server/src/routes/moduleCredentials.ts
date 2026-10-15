import type { FastifyInstance } from "fastify";
import { prisma } from "../db/prisma.js";
import {
  createModuleSession,
  isPasswordModule,
  revokeModuleSession,
} from "../security/moduleAuthorization.js";
import { hashCredential, verifyCredential } from "../security/technicianCredentials.js";
import { isModuleAllowed } from "../services/moduleRegistry.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
import { badRequest } from "./routeUtils.js";

type ModuleParams = { module: string };
type CredentialBody = { username?: unknown; password?: unknown; passwordRequired?: unknown };
const publicSelect = { id: true, username: true, passwordRequired: true, passwordHash: true };
function publicCredential(row: {
  id: string;
  username: string | null;
  passwordRequired: boolean;
  passwordHash: string | null;
}) {
  return {
    id: row.id,
    username: row.username,
    passwordRequired: row.passwordRequired,
    configured: Boolean(row.username && row.passwordHash),
  };
}
const normalize = (value: unknown, min: number, max: number) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max
    ? value.trim()
    : null;

export async function registerModuleCredentialRoutes(app: FastifyInstance) {
  app.get("/api/modules/credentials", async () => {
    const rows = await prisma.moduleCredential.findMany({ select: publicSelect });
    return ["operational", "bi"].map((id) => {
      const row = rows.find((item) => item.id === id);
      return row
        ? publicCredential(row)
        : { id, username: null, passwordRequired: false, configured: false };
    });
  });

  app.put<{ Params: ModuleParams; Body: CredentialBody }>(
    "/api/modules/:module/credentials",
    async (request, reply) => {
      const { module } = request.params;
      if (!isPasswordModule(module)) return badRequest(reply, "Módulo inválido.");
      if (typeof request.body?.passwordRequired !== "boolean")
        return badRequest(reply, "Informe se o módulo exige senha.");
      const username = normalize(request.body.username, 3, 80);
      const password =
        request.body.password === undefined || request.body.password === ""
          ? undefined
          : normalize(request.body.password, 6, 128);
      if (request.body.username && !username)
        return badRequest(reply, "Usuário deve possuir entre 3 e 80 caracteres.");
      if (password === null)
        return badRequest(reply, "Senha deve possuir entre 6 e 128 caracteres.");
      const current = await prisma.moduleCredential.findUnique({ where: { id: module } });
      const passwordHash = password
        ? await hashCredential(password)
        : (current?.passwordHash ?? null);
      if (request.body.passwordRequired && (!username || !passwordHash))
        return badRequest(reply, "Configure usuário e senha antes de exigir autenticação.");
      const saved = await prisma.moduleCredential.upsert({
        where: { id: module },
        create: {
          id: module,
          username,
          passwordHash,
          passwordRequired: request.body.passwordRequired,
          credentialVersion: 1,
        },
        update: {
          username,
          ...(password ? { passwordHash } : {}),
          passwordRequired: request.body.passwordRequired,
          credentialVersion: { increment: 1 },
        },
        select: publicSelect,
      });
      return publicCredential(saved);
    },
  );

  app.post<{ Params: ModuleParams; Body: CredentialBody }>(
    "/api/modules/:module/login",
    async (request, reply) => {
      const { module } = request.params;
      if (!isPasswordModule(module)) return badRequest(reply, "Módulo inválido.");
      const id = parseWorkstationId(request.headers["x-andon-workstation-id"]);
      const station = id ? await prisma.workstation.findUnique({ where: { id } }) : null;
      if (!station?.active || !isModuleAllowed(module, station))
        return reply.status(403).send({
          error: "module_forbidden",
          module,
          message: "Módulo não autorizado para esta workstation.",
        });
      const config = await prisma.moduleCredential.findUnique({ where: { id: module } });
      if (!config?.passwordRequired) return badRequest(reply, "Este módulo não exige senha.");
      const username = normalize(request.body?.username, 3, 80);
      const password = normalize(request.body?.password, 6, 128);
      if (
        !username ||
        !password ||
        username !== config.username ||
        !(await verifyCredential(password, config.passwordHash))
      )
        return reply
          .status(401)
          .send({ error: "module_login_invalid", message: "Usuário ou senha inválidos." });
      return createModuleSession(module, station.id, username, config.credentialVersion);
    },
  );

  app.post<{ Params: ModuleParams }>("/api/modules/:module/logout", async (request, reply) => {
    if (!isPasswordModule(request.params.module)) return badRequest(reply, "Módulo inválido.");
    revokeModuleSession(request, request.params.module);
    return { ok: true };
  });
}
