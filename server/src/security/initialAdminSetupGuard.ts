import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";

/**
 * A fresh installation cannot perform operational writes until the initial
 * global Admin secret has been created locally. Read-only APIs remain
 * available for the Hub's setup screen and health diagnostics.
 */
export function isBlockedBeforeAdminSetup(method: string, path: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  if (path === "/api/admin-auth/initialize" && method === "POST") return false;
  if (path === "/api/admin-auth/recover" && method === "POST") return false;
  return path.startsWith("/api/");
}

export async function enforceInitialAdminSetup(
  request: FastifyRequest, reply: FastifyReply,
) {
  const path = request.url.split("?", 1)[0] ?? "";
  if (!isBlockedBeforeAdminSetup(request.method, path))
    return;
  const configured = await prisma.systemSettings.findUnique({
    where: { id: "global" },
    select: { adminPasswordHash: true },
  });
  if (configured?.adminPasswordHash) return;
  return reply.status(428).header("Cache-Control", "no-store").send({
    error: "initial_admin_setup_required",
    message: "Cadastre a senha administrativa no primeiro acesso local ao Hub.",
  });
}
