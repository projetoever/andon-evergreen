import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { getAllowedCorsOrigins } from "../config/cors.js";
import { hashCredential } from "../security/technicianCredentials.js";
import { appendAudit } from "../access/audit.js";
import { validatePersonalPassword } from "../access/credentials.js";

const activeSetupTokens = new Map<string, { origin: string; expiresAt: number }>();
const TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_TOKENS = 16;

export class InitialAdminSetupError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number) {
    super(code);
  }
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Require a real loopback transport AND an allowed localhost browser Origin.
 * Neither X-Forwarded-For nor X-Forwarded-Host is accepted as proof.
 * The server must never configure trustProxy for this initial bootstrap.
 */
export function isLocalInitialAdminRequest(request: FastifyRequest) {
  // Read the transport socket, never a proxy-derived request.ip / XFF.
  const ip = request.raw.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return false;
  const host = request.headers.host ?? "";
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  const origin = request.headers.origin ?? "";
  try {
    const parsed = new URL(origin);
    const acceptableHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    const tls = Boolean((request.raw.socket as { encrypted?: boolean }).encrypted);
    return acceptableHost && (parsed.protocol === (tls ? "https:" : "http:")) &&
      parsed.username === "" && parsed.password === "" &&
      parsed.pathname === "/" && parsed.search === "" &&
      parsed.hash === "" &&
      getAllowedCorsOrigins().includes(origin);
  } catch {
    return false;
  }
}

export function issueInitialAdminSetupToken(request: FastifyRequest): string | null {
  if (!isLocalInitialAdminRequest(request)) return null;
  const now = Date.now();
  for (const [token, details] of activeSetupTokens)
    if (details.expiresAt <= now) activeSetupTokens.delete(token);
  if (activeSetupTokens.size >= MAX_TOKENS) activeSetupTokens.delete(activeSetupTokens.keys().next().value!);
  const token = randomBytes(32).toString("hex");
  activeSetupTokens.set(digest(token), {
    origin: request.headers.origin!, expiresAt: now + TOKEN_TTL_MS,
  });
  return token;
}

function assertInitialSetupToken(request: FastifyRequest, token: unknown) {
  if (!isLocalInitialAdminRequest(request))
    throw new InitialAdminSetupError("setup_local_only", 403);
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
    throw new InitialAdminSetupError("setup_token_invalid", 403);
  const details = activeSetupTokens.get(digest(token));
  if (!details || details.expiresAt <= Date.now() ||
      details.origin !== request.headers.origin)
    throw new InitialAdminSetupError("setup_token_invalid", 403);
}

export async function initializeGlobalAdminPassword(
  db: Pick<PrismaClient, "$transaction">,
  request: FastifyRequest,
  input: { setupToken?: unknown; password?: unknown },
) {
  assertInitialSetupToken(request, input.setupToken);
  if (typeof input.password !== "string")
    throw new InitialAdminSetupError("invalid_input", 400);
  try {
    validatePersonalPassword(input.password);
  } catch {
    throw new InitialAdminSetupError("password_policy_failed", 400);
  }
  const hash = await hashCredential(input.password);
  await db.$transaction(async tx => {
    await tx.systemSettings.upsert({
      where: { id: "global" }, update: {}, create: { id: "global" },
    });
    await tx.$queryRaw`SELECT id FROM system_settings WHERE id = 'global' FOR UPDATE`;
    const changed = await tx.systemSettings.updateMany({
      where: { id: "global", adminPasswordHash: null },
      data: { adminPasswordHash: hash },
    });
    if (changed.count !== 1)
      throw new InitialAdminSetupError("admin_already_configured", 409);
    await appendAudit(tx, {
      actorType: "legacy_admin",
      actorLogin: "admin",
      ipAddress: request.ip,
      requestId: request.id,
    }, {
      action: "admin.global_password.initialized",
      resourceType: "system_settings",
      resourceId: "global",
      after: { passwordConfigured: true },
    });
  });
  activeSetupTokens.delete(digest(input.setupToken as string));
  return { ok: true, passwordConfigured: true };
}
