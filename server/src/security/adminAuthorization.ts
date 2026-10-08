import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type AdminSession = {
  username: string;
  expiresAt: number;
};

const sessions = new Map<string, AdminSession>();

function getBearerToken(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function normalizePath(url: string) {
  return url.split("?", 1)[0] ?? url;
}

function matchesIdRoute(path: string, prefix: string) {
  return new RegExp(`^${prefix}/[^/]+$`).test(path);
}

export function createAdminSession(username: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  sessions.set(token, { username, expiresAt });

  return {
    token,
    username,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function revokeAdminSession(token: string | null) {
  if (token) sessions.delete(token);
}

export function readAdminSession(request: FastifyRequest) {
  const token = getBearerToken(request);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(token);
    return null;
  }

  return { token, session };
}

export function isAdminProtectedMutation(method: string, url: string) {
  const path = normalizePath(url);
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "PATCH" && path === "/api/system-settings") return true;

  if (
    normalizedMethod === "PUT" &&
    (path === "/api/dashboard-priority/credentials" || path === "/api/admin-auth/password")
  ) {
    return true;
  }

  if (
    normalizedMethod === "POST" &&
    (path === "/api/admin-auth/recovery-code" ||
      path === "/api/technicians" ||
      path === "/api/andon-categories" ||
      path === "/api/machines" ||
      path === "/api/failure-classifications" ||
      path === "/api/machine-set-types" ||
      path === "/api/machine-subset-types")
  ) {
    return true;
  }

  if (
    normalizedMethod === "POST" &&
    (/^\/api\/machines\/[^/]+\/sets$/.test(path) ||
      /^\/api\/machine-sets\/[^/]+\/subsets$/.test(path))
  ) {
    return true;
  }

  if (
    normalizedMethod === "PATCH" &&
    (matchesIdRoute(path, "/api/technicians") ||
      matchesIdRoute(path, "/api/andon-categories") ||
      matchesIdRoute(path, "/api/machines") ||
      /^\/api\/machines\/[^/]+\/active$/.test(path) ||
      matchesIdRoute(path, "/api/failure-classifications") ||
      matchesIdRoute(path, "/api/workstations") ||
      matchesIdRoute(path, "/api/machine-set-types") ||
      matchesIdRoute(path, "/api/machine-subset-types") ||
      matchesIdRoute(path, "/api/machine-sets") ||
      matchesIdRoute(path, "/api/machine-subsets") ||
      matchesIdRoute(path, "/api/shifts"))
  ) {
    return true;
  }

  if (
    normalizedMethod === "DELETE" &&
    (matchesIdRoute(path, "/api/andon-categories") ||
      matchesIdRoute(path, "/api/machine-set-types") ||
      matchesIdRoute(path, "/api/machine-subset-types") ||
      matchesIdRoute(path, "/api/machine-sets") ||
      matchesIdRoute(path, "/api/machine-subsets"))
  ) {
    return true;
  }

  return false;
}

export async function enforceAdminAuthorization(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!isAdminProtectedMutation(request.method, request.url)) return;

  if (!readAdminSession(request)) {
    return reply.status(401).send({
      error: "admin_auth_required",
      message: "Sessão administrativa necessária.",
    });
  }
}
