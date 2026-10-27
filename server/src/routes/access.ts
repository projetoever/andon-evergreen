import { randomBytes } from "node:crypto";
import type { TLSSocket } from "node:tls";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { appendAudit, actorFromPrincipal, type AuditActor } from "../access/audit.js";
import { AccessError, PERMISSIONS } from "../access/policy.js";
import { csrfToken, checkCsrf, tokenHash } from "../access/credentials.js";
import {
  login,
  changePassword,
  resolveSession,
  resetPassword,
  logout,
  recordInteraction,
} from "../access/sessions.js";
import {
  initializeUserAdmin,
  requireUserAdmin,
  ROLES,
  saveUser,
  userSelect,
  type UserInput,
} from "../access/users.js";
import { parseWorkstationId } from "../services/workstationAuthorization.js";
const PREFIX = "/api/access";
const COOKIE = "__Host-andon-access";
const PREAUTH = "__Host-andon-preauth";
function cookie(request: FastifyRequest, name: string) {
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(`${name}=`));
  const value = values.length === 1 ? values[0].slice(name.length + 1) : "";
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}
function setCookie(reply: FastifyReply, name: string, value: string, maxAge: number) {
  reply.header(
    "Set-Cookie",
    `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
  );
}
const string = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const schema = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  body: { type: "object", additionalProperties: false, required, properties },
});
const userProperties = {
  login: string(120),
  displayName: string(120),
  roleLabel: { enum: [...ROLES] },
  accountType: { enum: ["person", "kiosk"] },
  active: { type: "boolean" },
  machineScope: { enum: ["all", "selected"] },
  permissions: {
    type: "array",
    maxItems: PERMISSIONS.length,
    uniqueItems: true,
    items: { enum: [...PERMISSIONS] },
  },
  machineIds: { type: "array", maxItems: 1000, uniqueItems: true, items: string(120) },
};
export function registerAccessRoutes(
  root: FastifyInstance,
  db: PrismaClient = prisma,
  origin = process.env.ANDON_ACCESS_ORIGIN ?? "",
) {
  return root.register(async (app) => {
    // Bounded per-process limits. Not reset on success; no secret/login strings retained.
    const buckets = new Map<string, { count: number; until: number }>();
    const limited = (key: string, limit: number, windowMs: number) => {
      const now = Date.now();
      for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
      const bucket = buckets.get(key) ?? { count: 0, until: now + windowMs };
      if (!buckets.has(key) && buckets.size >= 5000) throw new AccessError("rate_limited", 429);
      bucket.count++;
      buckets.set(key, bucket);
      if (bucket.count > limit) throw new AccessError("rate_limited", 429);
    };
    const requestAccess = (req: FastifyRequest) => ({
      token: cookie(req, COOKIE),
      workstationId: parseWorkstationId(req.headers["x-andon-workstation-id"]) ?? "",
    });
    app.addHook("onRequest", async (req, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      if (!(req.raw.socket as TLSSocket).encrypted || !origin.startsWith("https://"))
        throw new AccessError("https_required", 426);
      if (req.headers.origin !== origin) throw new AccessError("origin_denied");
      limited(`ip:${req.ip}`, 300, 60000);
      if (!["GET", "HEAD"].includes(req.method)) {
        const token = cookie(req, COOKIE) || cookie(req, PREAUTH);
        if (!token || !checkCsrf(token, req.headers["x-andon-csrf"]))
          throw new AccessError("csrf_denied");
      }
    });
    app.addHook("preValidation", async (req) => {
      const properties = (
        req.routeOptions.schema?.body as { properties?: Record<string, unknown> } | undefined
      )?.properties;
      if (
        properties &&
        req.body &&
        typeof req.body === "object" &&
        Object.keys(req.body).some((key) => !(key in properties))
      )
        throw new AccessError("invalid_input", 400);
    });
    app.addHook("preHandler", async (req) => {
      const station = await db.workstation.findUnique({
        where: { id: requestAccess(req).workstationId },
      });
      if (!station?.active || station.pendingApproval) throw new AccessError("workstation_denied");
      if (
        req.method === "POST" &&
        /\/(login|initialize|password|reset)$/.test(req.routeOptions.url ?? "")
      ) {
        limited(`credential:${req.ip}`, 20, 15 * 60000);
        const body = req.body as { login?: string };
        if (body.login)
          limited(`login:${tokenHash(body.login.trim().toLowerCase())}`, 10, 15 * 60000);
      }
    });
    app.setErrorHandler(async (error, req, reply) => {
      const e = error as Error & { code?: string; validation?: unknown };
      const status =
        error instanceof AccessError
          ? error.statusCode
          : e.code === "P2002"
            ? 409
            : e.validation || ["invalid_login", "password_policy_failed"].includes(e.message)
              ? 400
              : 500;
      const code =
        error instanceof AccessError
          ? error.code
          : e.code === "P2002"
            ? "user_conflict"
            : status === 400
              ? "invalid_input"
              : "access_unavailable";
      // Never log exception objects, request bodies or query parameters in this subsystem.
      if ((req.raw.socket as TLSSocket).encrypted && status < 500) {
        let actor: AuditActor = {
          actorType: "legacy_unidentified",
          ipAddress: req.ip,
          requestId: req.id,
        };
        try {
          actor = {
            ...actorFromPrincipal(await resolveSession(db, requestAccess(req))),
            ipAddress: req.ip,
            requestId: req.id,
          };
        } catch {
          /* unauthenticated */
        }
        try {
          await appendAudit(db, actor, {
            action: "access.request.denied",
            resourceType: "access",
            result: "denied",
            reason: code,
          });
        } catch {
          return reply.status(503).send({ error: "access_unavailable" });
        }
      }
      return reply.status(status).send({ error: code });
    });
    const sendSession = (
      reply: FastifyReply,
      session: { token: string; expiresAt: Date; purpose: string },
    ) => {
      setCookie(
        reply,
        COOKIE,
        session.token,
        Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
      );
      return { csrf: csrfToken(session.token), purpose: session.purpose };
    };
    app.get(`${PREFIX}/session`, async (req, reply) => {
      let principal = null;
      try {
        principal = await resolveSession(db, requestAccess(req));
      } catch (e) {
        if (!(e instanceof AccessError)) throw e;
      }
      let token = cookie(req, COOKIE) || cookie(req, PREAUTH);
      if (!token) {
        token = randomBytes(32).toString("hex");
        setCookie(reply, PREAUTH, token, 600);
      }
      return {
        principal,
        csrf: csrfToken(token),
        initialized: Boolean(
          await db.accessUser.findFirst({ where: { isPrimaryAdmin: true }, select: { id: true } }),
        ),
      };
    });
    app.post<{ Body: { login: string; password: string } }>(
      `${PREFIX}/login`,
      { schema: schema({ login: string(120), password: string(256) }) },
      async (req, reply) =>
        sendSession(
          reply,
          await login(
            db,
            { ...req.body, workstationId: requestAccess(req).workstationId },
            { ipAddress: req.ip, requestId: req.id },
          ),
        ),
    );
    app.post<{ Body: { currentPassword: string; newPassword: string } }>(
      `${PREFIX}/initialize`,
      { schema: schema({ currentPassword: string(128), newPassword: string(256) }) },
      async (req, reply) =>
        sendSession(
          reply,
          await initializeUserAdmin(
            db,
            requestAccess(req).workstationId,
            req.body.currentPassword,
            req.body.newPassword,
          ),
        ),
    );
    app.post<{ Body: { newPassword: string; currentPassword?: string } }>(
      `${PREFIX}/password`,
      {
        schema: schema({ newPassword: string(256), currentPassword: string(256) }, ["newPassword"]),
      },
      async (req, reply) =>
        sendSession(
          reply,
          await changePassword(
            db,
            requestAccess(req),
            req.body.newPassword,
            req.body.currentPassword,
          ),
        ),
    );
    app.post(`${PREFIX}/logout`, async (req, reply) => {
      await logout(db, requestAccess(req));
      setCookie(reply, COOKIE, "", 0);
      return { ok: true };
    });
    app.post(`${PREFIX}/interaction`, async (req) => {
      await recordInteraction(db, requestAccess(req));
      return { ok: true };
    });
    app.get(`${PREFIX}/catalog`, async (req) => {
      await requireUserAdmin(db, requestAccess(req));
      return {
        permissions: PERMISSIONS,
        roles: ROLES,
        machines: await db.machine.findMany({
          select: { id: true, name: true, isActive: true },
          orderBy: { name: "asc" },
        }),
      };
    });
    app.get<{ Querystring: { q?: string; page?: number } }>(
      `${PREFIX}/users`,
      {
        schema: {
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
              q: { type: "string", maxLength: 120 },
              page: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
            },
          },
        },
      },
      async (req) => {
        await requireUserAdmin(db, requestAccess(req));
        const q = req.query.q?.trim();
        const where = q
          ? {
              OR: ["displayName", "login", "roleLabel"].map((key) => ({
                [key]: { contains: q, mode: "insensitive" as const },
              })),
            }
          : {};
        const [users, total] = await db.$transaction([
          db.accessUser.findMany({
            where,
            select: userSelect,
            orderBy: [{ displayName: "asc" }, { id: "asc" }],
            skip: (req.query.page ?? 0) * 30,
            take: 30,
          }),
          db.accessUser.count({ where }),
        ]);
        return { users, total };
      },
    );
    app.post<{ Body: UserInput }>(`${PREFIX}/users`, { schema: schema(userProperties) }, (req) =>
      saveUser(db, requestAccess(req), req.body),
    );
    app.put<{ Params: { id: string }; Body: UserInput }>(
      `${PREFIX}/users/:id`,
      { schema: schema({ ...userProperties, version: { type: "integer", minimum: 1 } }) },
      (req) => saveUser(db, requestAccess(req), req.body, req.params.id),
    );
    app.post<{ Params: { id: string }; Body: { reason: string } }>(
      `${PREFIX}/users/:id/reset`,
      { schema: schema({ reason: string(500) }) },
      async (req) => {
        await requireUserAdmin(db, requestAccess(req));
        const user = await db.accessUser.findUnique({
          where: { id: req.params.id },
          select: { accountType: true },
        });
        if (!user || user.accountType !== "person") throw new AccessError("invalid_user", 400);
        return resetPassword(db, requestAccess(req), req.params.id, req.body.reason);
      },
    );
  });
}
