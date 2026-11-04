import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma.js";
import { centralAccessEnabled } from "../access/http.js";

/**
 * Deny ALL application API access on a fresh installation until its first
 * Admin secret exists. A public read is still a disclosure: the browser only
 * needs bootstrap status and the one-time local initialize endpoint.
 * Health routes (/health/*) remain available to the installer/watchdog.
 * OPTIONS is preflight only and does not execute an application handler.
 */
export function isBlockedBeforeAdminSetup(
  method: string, path: string, centralMode = false,
) {
  const verb = method.toUpperCase();
  if (verb === "OPTIONS" || !path.startsWith("/api/")) return false;
  if (path === "/api/admin-auth/status" && verb === "GET") return false;
  if (!centralMode && path === "/api/admin-auth/initialize" && verb === "POST") return false;
  if (centralMode && path === "/api/admin-auth/initialize-central" && verb === "POST") return false;
  return true;
}

export async function enforceInitialAdminSetup(
  request: FastifyRequest, reply: FastifyReply,
) {
  // Prefer the matched route pattern: encoded URL aliases must not bypass
  // the gate even if their raw request target looks different.
  const path = request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "";
  const central = centralAccessEnabled();
  if (!isBlockedBeforeAdminSetup(request.method, path, central)) return;
  const configured = await prisma.systemSettings.findUnique({
    where: { id: "global" },
    select: { adminPasswordHash: true },
  });
  if (configured?.adminPasswordHash) return;
  // A new central-mode installation may have a primary Admin without ever
  // creating a duplicate global legacy credential.
  if (central && await prisma.accessUser.findFirst({
    where: { isPrimaryAdmin: true }, select: { id: true },
  })) return;
  return reply.status(428).header("Cache-Control", "no-store").send({
    error: "initial_admin_setup_required",
    message: "Cadastre a senha administrativa no primeiro acesso local ao Hub.",
  });
}
