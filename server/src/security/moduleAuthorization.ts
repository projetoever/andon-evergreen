import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import { apiModule } from "../services/moduleRegistry.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";

export type PasswordModule = "operational" | "bi";
export type ModulePolicy = { passwordRequired: boolean; credentialVersion: number };
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<
  string,
  {
    module: PasswordModule;
    workstationId: string;
    username: string;
    credentialVersion: number;
    expiresAt: number;
  }
>();

export const isPasswordModule = (value: string): value is PasswordModule =>
  value === "operational" || value === "bi";

export function moduleToken(request: FastifyRequest, module: PasswordModule) {
  const value = request.headers[module === "bi" ? "x-andon-bi-token" : "x-andon-operational-token"];
  return typeof value === "string" ? value : null;
}

export function createModuleSession(
  module: PasswordModule,
  workstationId: string,
  username: string,
  credentialVersion: number,
) {
  for (const [token, session] of sessions)
    if (session.expiresAt <= Date.now()) sessions.delete(token);
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { module, workstationId, username, credentialVersion, expiresAt });
  return { token, username, expiresAt: new Date(expiresAt).toISOString() };
}

export function hasModuleSession(
  request: FastifyRequest,
  module: PasswordModule,
  policy: ModulePolicy,
) {
  if (!policy.passwordRequired) return true;
  const token = moduleToken(request, module);
  const session = token ? sessions.get(token) : undefined;
  if (
    !session ||
    session.module !== module ||
    session.workstationId !== parseWorkstationId(request.headers["x-andon-workstation-id"])
  )
    return false;
  if (session.expiresAt <= Date.now() || session.credentialVersion !== policy.credentialVersion) {
    sessions.delete(token!);
    return false;
  }
  return true;
}

export function revokeModuleSession(request: FastifyRequest, module: PasswordModule) {
  const token = moduleToken(request, module);
  if (token) sessions.delete(token);
}

/** Password protection also applies to unidentified/legacy requests when explicitly enabled. */
export async function enforceModuleAuthorization(request: FastifyRequest, reply: FastifyReply) {
  if (request.method === "OPTIONS") return;
  if (request.industrialService) return;
  const path = request.url.split("?", 1)[0] ?? "";
  if (
    !path.startsWith("/api/") ||
    path === "/api/workstations/register" ||
    path.startsWith("/api/health")
  )
    return;
  const module = apiModule(path);
  if (!module || !isPasswordModule(module)) return;
  const policy = await prisma.moduleCredential.findUnique({
    where: { id: module },
    select: { passwordRequired: true, credentialVersion: true },
  });
  if (!policy?.passwordRequired || hasModuleSession(request, module, policy)) return;
  return reply.status(401).send({
    error: "module_auth_required",
    module,
    message: "Entre com a credencial deste módulo.",
  });
}
