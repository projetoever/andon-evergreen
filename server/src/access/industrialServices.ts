import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { appendAudit, actorFromPrincipal } from "./audit.js";
import { hashAccessPassword, tokenHash, verifyAccessPassword } from "./credentials.js";
import { AccessError } from "./policy.js";
import { assertRecentAdmin, resolveSession, type AccessRequest } from "./sessions.js";

export const INDUSTRIAL_SERVICE_SCOPES = ["machines.read", "calls.read", "sound.read"] as const;
export type IndustrialServiceScope = (typeof INDUSTRIAL_SERVICE_SCOPES)[number];

export type IndustrialServicePrincipal = {
  serviceId: string;
  name: string;
  scopes: string[];
  sessionId: string;
};

const SERVICE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_SECRET_TTL_DAYS = 1;
const MAX_SECRET_TTL_DAYS = 365;
const DUMMY_HASH = `andon-scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new AccessError("invalid_input", 400);
  return name;
}

function normalizeScopes(values: string[]) {
  const scopes = [...new Set(values)];
  if (
    scopes.length === 0 ||
    scopes.some((scope) => !(INDUSTRIAL_SERVICE_SCOPES as readonly string[]).includes(scope))
  )
    throw new AccessError("invalid_service_scope", 400);
  return scopes;
}

function secretExpiry(ttlDays: number, now = new Date()) {
  if (!Number.isInteger(ttlDays) || ttlDays < MIN_SECRET_TTL_DAYS || ttlDays > MAX_SECRET_TTL_DAYS)
    throw new AccessError("invalid_credential_ttl", 400);
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

function createClientSecret() {
  return `andon-service-secret-v1.${randomBytes(32).toString("base64url")}`;
}

function createAccessToken() {
  return `andon-service-v1.${randomBytes(32).toString("base64url")}`;
}

export async function listIndustrialServices(db: PrismaClient, request: AccessRequest) {
  const principal = await resolveSession(db, request);
  assertRecentAdmin(principal);
  return db.industrialServiceIdentity.findMany({
    select: {
      id: true,
      name: true,
      active: true,
      scopes: true,
      secretVersion: true,
      secretExpiresAt: true,
      createdAt: true,
      updatedAt: true,
      revokedAt: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export async function createIndustrialService(
  db: PrismaClient,
  request: AccessRequest,
  input: { name: string; scopes: string[]; credentialTtlDays: number; reason: string },
) {
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  const name = normalizeName(input.name);
  const scopes = normalizeScopes(input.scopes);
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!reason) throw new AccessError("reason_required", 400);
  const now = new Date();
  const secretExpiresAt = secretExpiry(input.credentialTtlDays, now);
  const clientSecret = createClientSecret();
  const secretHash = await hashAccessPassword(clientSecret);
  const service = await db.$transaction(async (tx) => {
    const principal = await resolveSession(tx, request);
    assertRecentAdmin(principal);
    const created = await tx.industrialServiceIdentity.create({
      data: { name, scopes, secretHash, secretExpiresAt },
      select: {
        id: true,
        name: true,
        active: true,
        scopes: true,
        secretVersion: true,
        secretExpiresAt: true,
      },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "industrial_service.created",
      resourceType: "industrial_service",
      resourceId: created.id,
      reason,
      after: {
        name: created.name,
        scopes: created.scopes,
        secretVersion: created.secretVersion,
        secretExpiresAt: created.secretExpiresAt,
      },
    });
    return created;
  });
  return { ...service, clientId: service.id, clientSecret };
}

export async function rotateIndustrialServiceSecret(
  db: PrismaClient,
  request: AccessRequest,
  serviceId: string,
  input: { credentialTtlDays: number; reason: string },
) {
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (!reason) throw new AccessError("reason_required", 400);
  const clientSecret = createClientSecret();
  const secretHash = await hashAccessPassword(clientSecret);
  const secretExpiresAt = secretExpiry(input.credentialTtlDays);
  const service = await db.$transaction(async (tx) => {
    const principal = await resolveSession(tx, request);
    assertRecentAdmin(principal);
    const current = await tx.industrialServiceIdentity.findUnique({ where: { id: serviceId } });
    if (!current) throw new AccessError("service_not_found", 404);
    if (!current.active) throw new AccessError("service_revoked", 409);
    const now = new Date();
    const updated = await tx.industrialServiceIdentity.update({
      where: { id: serviceId },
      data: {
        secretHash,
        secretExpiresAt,
        secretVersion: { increment: 1 },
      },
      select: {
        id: true,
        name: true,
        active: true,
        scopes: true,
        secretVersion: true,
        secretExpiresAt: true,
      },
    });
    await tx.industrialServiceSession.updateMany({
      where: { serviceId, revokedAt: null },
      data: { revokedAt: now },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "industrial_service.secret.rotated",
      resourceType: "industrial_service",
      resourceId: serviceId,
      reason,
      before: { secretVersion: current.secretVersion, secretExpiresAt: current.secretExpiresAt },
      after: {
        secretVersion: updated.secretVersion,
        secretExpiresAt: updated.secretExpiresAt,
      },
    });
    return updated;
  });
  return { ...service, clientId: service.id, clientSecret };
}

export async function revokeIndustrialService(
  db: PrismaClient,
  request: AccessRequest,
  serviceId: string,
  reasonValue: string,
) {
  const initial = await resolveSession(db, request);
  assertRecentAdmin(initial);
  const reason = reasonValue.trim().replace(/\s+/g, " ");
  if (!reason) throw new AccessError("reason_required", 400);
  return db.$transaction(async (tx) => {
    const principal = await resolveSession(tx, request);
    assertRecentAdmin(principal);
    const current = await tx.industrialServiceIdentity.findUnique({ where: { id: serviceId } });
    if (!current) throw new AccessError("service_not_found", 404);
    if (!current.active) throw new AccessError("service_already_revoked", 409);
    const now = new Date();
    await tx.industrialServiceIdentity.update({
      where: { id: serviceId },
      data: { active: false, revokedAt: now, secretVersion: { increment: 1 } },
    });
    await tx.industrialServiceSession.updateMany({
      where: { serviceId, revokedAt: null },
      data: { revokedAt: now },
    });
    await appendAudit(tx, actorFromPrincipal(principal), {
      action: "industrial_service.revoked",
      resourceType: "industrial_service",
      resourceId: serviceId,
      reason,
      before: { active: true, scopes: current.scopes },
      after: { active: false, revokedAt: now },
    });
    return { ok: true };
  });
}

export async function issueIndustrialServiceSession(
  db: PrismaClient,
  input: { clientId: string; clientSecret: string },
  context: { ipAddress?: string; requestId?: string } = {},
) {
  const service = await db.industrialServiceIdentity.findUnique({ where: { id: input.clientId } });
  const validSecret = await verifyAccessPassword(
    input.clientSecret,
    service?.secretHash ?? DUMMY_HASH,
  );
  const now = new Date();
  if (
    !service ||
    !validSecret ||
    !service.active ||
    service.revokedAt ||
    service.secretExpiresAt <= now
  )
    throw new AccessError("invalid_service_credentials", 401);
  const accessToken = createAccessToken();
  const expiresAt = new Date(now.getTime() + SERVICE_SESSION_TTL_MS);
  const session = await db.$transaction(async (tx) => {
    const current = await tx.industrialServiceIdentity.findUniqueOrThrow({
      where: { id: service.id },
    });
    if (
      !current.active ||
      current.revokedAt ||
      current.secretVersion !== service.secretVersion ||
      current.secretHash !== service.secretHash ||
      current.secretExpiresAt <= now
    )
      throw new AccessError("invalid_service_credentials", 401);
    const created = await tx.industrialServiceSession.create({
      data: {
        tokenHash: tokenHash(accessToken),
        serviceId: current.id,
        secretVersion: current.secretVersion,
        expiresAt,
      },
    });
    await appendAudit(
      tx,
      {
        actorType: "service",
        actorLogin: current.id,
        actorName: current.name,
        sessionId: created.id,
        ...context,
      },
      {
        action: "industrial_service.session.issued",
        resourceType: "industrial_service",
        resourceId: current.id,
        after: { scopes: current.scopes, expiresAt },
      },
    );
    return created;
  });
  return {
    tokenType: "Bearer",
    accessToken,
    expiresAt: session.expiresAt,
    scopes: service.scopes,
  };
}

export function readIndustrialServiceBearer(authorization: unknown) {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer (andon-service-v1\.[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (match) return match[1];
  return authorization.startsWith("Bearer andon-service-v1.") ? "" : null;
}

export async function authenticateIndustrialServiceSession(
  db: PrismaClient,
  accessToken: string,
  now = new Date(),
): Promise<IndustrialServicePrincipal> {
  if (!accessToken) throw new AccessError("service_auth_required", 401);
  const session = await db.industrialServiceSession.findUnique({
    where: { tokenHash: tokenHash(accessToken) },
    include: { service: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.service.active ||
    session.service.revokedAt ||
    session.service.secretExpiresAt <= now ||
    session.secretVersion !== session.service.secretVersion
  )
    throw new AccessError("service_auth_required", 401);
  if (session.lastUsedAt.getTime() + 5 * 60 * 1000 <= now.getTime())
    await db.industrialServiceSession.updateMany({
      where: { id: session.id, lastUsedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
      data: { lastUsedAt: now },
    });
  return {
    serviceId: session.service.id,
    name: session.service.name,
    scopes: session.service.scopes,
    sessionId: session.id,
  };
}
