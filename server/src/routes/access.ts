import { randomBytes } from "node:crypto";
import type { TLSSocket } from "node:tls";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { appendAudit, actorFromPrincipal, type AuditActor } from "../access/audit.js";
import { AccessError, PERMISSIONS, assertPermission } from "../access/policy.js";
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
import { ACCESS_COOKIE, PREAUTH_COOKIE, readSecureCookie } from "../access/http.js";
import { lockWorkstationFlow } from "../db/workstationFlowLock.js";
import {
  INDUSTRIAL_SERVICE_SCOPES,
  createIndustrialService,
  listIndustrialServices,
  revokeIndustrialService,
  rotateIndustrialServiceSecret,
} from "../access/industrialServices.js";
const PREFIX = "/api/access";
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
const serviceScopes = {
  type: "array",
  minItems: 1,
  maxItems: INDUSTRIAL_SERVICE_SCOPES.length,
  uniqueItems: true,
  items: { enum: [...INDUSTRIAL_SERVICE_SCOPES] },
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
      token: readSecureCookie(req, ACCESS_COOKIE),
      workstationId: parseWorkstationId(req.headers["x-andon-workstation-id"]) ?? "",
    });
    app.addHook("onRequest", async (req, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      if (!(req.raw.socket as TLSSocket).encrypted || !origin.startsWith("https://"))
        throw new AccessError("https_required", 426);
      if (req.headers.origin !== origin) throw new AccessError("origin_denied");
      limited(`ip:${req.ip}`, 300, 60000);
      if (!["GET", "HEAD"].includes(req.method)) {
        const token = readSecureCookie(req, ACCESS_COOKIE) || readSecureCookie(req, PREAUTH_COOKIE);
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
      const route = req.routeOptions.url ?? "";
      const station = await db.workstation.findUnique({
        where: { id: requestAccess(req).workstationId },
      });
      const admissionRoute =
        route === `${PREFIX}/session` ||
        route === `${PREFIX}/login` ||
        route === `${PREFIX}/admission/request`;
      if (!station || ((!station.active || station.pendingApproval) && !admissionRoute))
        throw new AccessError("workstation_denied");
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
            ...actorFromPrincipal(await resolveSession(db, requestAccess(req), new Date(), true)),
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
        ACCESS_COOKIE,
        session.token,
        Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
      );
      return { csrf: csrfToken(session.token), purpose: session.purpose };
    };
    app.get(`${PREFIX}/session`, async (req, reply) => {
      let principal = null;
      try {
        principal = await resolveSession(db, requestAccess(req), new Date(), true);
      } catch (e) {
        if (!(e instanceof AccessError)) throw e;
      }
      let token = readSecureCookie(req, ACCESS_COOKIE) || readSecureCookie(req, PREAUTH_COOKIE);
      if (!token) {
        token = randomBytes(32).toString("hex");
        setCookie(reply, PREAUTH_COOKIE, token, 600);
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
    app.post<{ Body: { login: string; currentPassword: string; newPassword: string } }>(
      `${PREFIX}/initialize`,
      {
        schema: schema({
          login: string(120),
          currentPassword: string(128),
          newPassword: string(256),
        }),
      },
      async (req, reply) =>
        sendSession(
          reply,
          await initializeUserAdmin(
            db,
            requestAccess(req).workstationId,
            req.body.login,
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
      setCookie(reply, ACCESS_COOKIE, "", 0);
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
    app.get(`${PREFIX}/service-identities`, (req) =>
      listIndustrialServices(db, requestAccess(req)),
    );
    app.post<{
      Body: { name: string; scopes: string[]; credentialTtlDays: number; reason: string };
    }>(
      `${PREFIX}/service-identities`,
      {
        schema: schema({
          name: string(120),
          scopes: serviceScopes,
          credentialTtlDays: { type: "integer", minimum: 1, maximum: 365 },
          reason: string(500),
        }),
      },
      (req) => createIndustrialService(db, requestAccess(req), req.body),
    );
    app.post<{
      Params: { id: string };
      Body: { credentialTtlDays: number; reason: string };
    }>(
      `${PREFIX}/service-identities/:id/rotate`,
      {
        schema: schema({
          credentialTtlDays: { type: "integer", minimum: 1, maximum: 365 },
          reason: string(500),
        }),
      },
      (req) => rotateIndustrialServiceSecret(db, requestAccess(req), req.params.id, req.body),
    );
    app.post<{ Params: { id: string }; Body: { reason: string } }>(
      `${PREFIX}/service-identities/:id/revoke`,
      { schema: schema({ reason: string(500) }) },
      (req) => revokeIndustrialService(db, requestAccess(req), req.params.id, req.body.reason),
    );
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
    app.post<{ Body: { requestedName: string; reason?: string } }>(
      `${PREFIX}/admission/request`,
      {
        schema: schema({ requestedName: string(120), reason: string(500) }, ["requestedName"]),
      },
      async (req) => {
        const principal = await resolveSession(db, requestAccess(req), new Date(), true);
        if (principal.purpose !== "workstation_admission")
          throw new AccessError("admission_not_required", 409);
        const requestedName = req.body.requestedName.trim().replace(/\s+/g, " ");
        const reason = req.body.reason?.trim().replace(/\s+/g, " ") || null;
        if (!requestedName) throw new AccessError("invalid_input", 400);
        return db.$transaction(async (tx) => {
          await lockWorkstationFlow(tx, principal.workstationId);
          const current = await resolveSession(tx, requestAccess(req), new Date(), true);
          if (current.purpose !== "workstation_admission")
            throw new AccessError("admission_not_required", 409);
          const station = await tx.workstation.findUniqueOrThrow({
            where: { id: current.workstationId },
          });
          if (station.active && !station.pendingApproval)
            throw new AccessError("admission_not_required", 409);
          const now = new Date();
          const admission = await tx.workstationAdmission.upsert({
            where: { workstationId: station.id },
            create: {
              workstationId: station.id,
              requesterUserId: current.userId,
              requestedName,
              requestReason: reason,
              requestIpAddress: req.ip.replace(/^::ffff:/, ""),
              status: "pending",
              requestedAt: now,
            },
            update: {
              requesterUserId: current.userId,
              requestedName,
              requestReason: reason,
              requestIpAddress: req.ip.replace(/^::ffff:/, ""),
              status: "pending",
              requestedAt: now,
              decidedAt: null,
              decidedByUserId: null,
              decisionReason: null,
            },
          });
          await tx.workstation.update({
            where: { id: station.id },
            data: {
              active: false,
              pendingApproval: true,
              allowOperational: false,
              allowBi: false,
              allowPriorities: false,
            },
          });
          await appendAudit(tx, actorFromPrincipal(current), {
            action: "workstation.admission.requested",
            resourceType: "workstation",
            resourceId: station.id,
            after: {
              admissionId: admission.id,
              requestedName,
              status: "pending",
            },
          });
          return { status: admission.status, requestedAt: admission.requestedAt };
        });
      },
    );

    app.get(`${PREFIX}/workstations`, async (req) => {
      const principal = await resolveSession(db, requestAccess(req));
      assertPermission(principal, "workstations.read");
      const now = new Date();
      const rows = await db.workstation.findMany({
        include: {
          admission: {
            include: {
              requester: { select: { id: true, login: true, displayName: true, roleLabel: true } },
              decidedBy: { select: { id: true, login: true, displayName: true, roleLabel: true } },
            },
          },
          accessSessions: {
            include: {
              user: {
                select: {
                  id: true,
                  login: true,
                  displayName: true,
                  roleLabel: true,
                  active: true,
                  authorizationVersion: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: [{ pendingApproval: "desc" }, { active: "desc" }, { lastSeenAt: "desc" }],
      });
      return rows.map(({ accessSessions, ...station }) => {
        const latest = accessSessions[0] ?? null;
        const valid = Boolean(
          latest &&
          !latest.revokedAt &&
          latest.expiresAt > now &&
          latest.lastInteractionAt.getTime() + 30 * 60 * 1000 > now.getTime() &&
          latest.user.active &&
          latest.authorizationVersion === latest.user.authorizationVersion &&
          station.active &&
          !station.pendingApproval &&
          latest.purpose === "normal",
        );
        const sessionState = !latest
          ? "none"
          : valid
            ? "valid"
            : latest.revokedAt
              ? "revoked"
              : latest.expiresAt <= now ||
                  latest.lastInteractionAt.getTime() + 30 * 60 * 1000 <= now.getTime()
                ? "expired"
                : !latest.user.active
                  ? "user_inactive"
                  : "workstation_blocked";
        return {
          ...station,
          linkedAccount: station.admission?.requester ?? null,
          authenticatedAccount: valid ? latest?.user : null,
          lastLogin: latest
            ? {
                account: latest.user,
                createdAt: latest.createdAt,
                lastInteractionAt: latest.lastInteractionAt,
                expiresAt: latest.expiresAt,
                purpose: latest.purpose,
                state: sessionState,
              }
            : null,
        };
      });
    });

    app.patch<{
      Params: { id: string };
      Body: {
        name?: string;
        active?: boolean;
        allowOperational?: boolean;
        allowBi?: boolean;
        allowPriorities?: boolean;
      };
    }>(
      `${PREFIX}/workstations/:id`,
      {
        schema: schema(
          {
            name: { type: "string", maxLength: 120 },
            active: { type: "boolean" },
            allowOperational: { type: "boolean" },
            allowBi: { type: "boolean" },
            allowPriorities: { type: "boolean" },
          },
          [],
        ),
      },
      async (req) => {
        const initial = await resolveSession(db, requestAccess(req));
        assertPermission(initial, "workstations.manage");
        const id = parseWorkstationId(req.params.id);
        if (!id || Object.keys(req.body).length === 0) throw new AccessError("invalid_input", 400);
        if (req.body.active === false && id === initial.workstationId)
          throw new AccessError("current_workstation_protected", 400);
        return db.$transaction(async (tx) => {
          await lockWorkstationFlow(tx, id);
          const principal = await resolveSession(tx, requestAccess(req));
          assertPermission(principal, "workstations.manage");
          const station = await tx.workstation.findUnique({
            where: { id },
            include: { admission: true },
          });
          if (!station) throw new AccessError("workstation_not_found", 404);
          if (
            station.pendingApproval ||
            (req.body.active === true && station.admission?.status === "rejected")
          )
            throw new AccessError("admission_decision_required", 409);
          if (
            (req.body.active === false || req.body.allowOperational === false) &&
            station.lockedMachineId
          )
            throw new AccessError("workstation_screen_locked", 409);
          if (req.body.active === false || req.body.allowOperational === false) {
            const activeAttendance = await tx.technicianSession.findFirst({
              where: { workstationId: id, endedAt: null },
              select: { id: true },
            });
            if (activeAttendance) throw new AccessError("workstation_attendance_active", 409);
          }
          const name =
            req.body.name === undefined
              ? undefined
              : req.body.name.trim().replace(/\s+/g, " ") || null;
          const before = {
            name: station.name,
            active: station.active,
            allowOperational: station.allowOperational,
            allowBi: station.allowBi,
            allowPriorities: station.allowPriorities,
          };
          const updated = await tx.workstation.update({
            where: { id },
            data: {
              ...(req.body.name === undefined ? {} : { name }),
              ...(req.body.active === undefined ? {} : { active: req.body.active }),
              ...(req.body.allowOperational === undefined
                ? {}
                : { allowOperational: req.body.allowOperational }),
              ...(req.body.allowBi === undefined ? {} : { allowBi: req.body.allowBi }),
              ...(req.body.allowPriorities === undefined
                ? {}
                : { allowPriorities: req.body.allowPriorities }),
            },
          });
          if (req.body.active === false)
            await tx.accessSession.updateMany({
              where: { workstationId: id, revokedAt: null },
              data: { revokedAt: new Date() },
            });
          await appendAudit(tx, actorFromPrincipal(principal), {
            action: "workstation.access.updated",
            resourceType: "workstation",
            resourceId: id,
            before,
            after: {
              name: updated.name,
              active: updated.active,
              allowOperational: updated.allowOperational,
              allowBi: updated.allowBi,
              allowPriorities: updated.allowPriorities,
            },
          });
          return { ok: true };
        });
      },
    );

    app.post<{
      Params: { id: string };
      Body: {
        decision: "approve" | "reject";
        reason: string;
        allowOperational: boolean;
        allowBi: boolean;
        allowPriorities: boolean;
      };
    }>(
      `${PREFIX}/workstations/:id/decision`,
      {
        schema: schema({
          decision: { enum: ["approve", "reject"] },
          reason: string(500),
          allowOperational: { type: "boolean" },
          allowBi: { type: "boolean" },
          allowPriorities: { type: "boolean" },
        }),
      },
      async (req) => {
        const initial = await resolveSession(db, requestAccess(req));
        assertPermission(initial, "workstations.manage");
        const reason = req.body.reason.trim().replace(/\s+/g, " ");
        if (!reason) throw new AccessError("reason_required", 400);
        const id = parseWorkstationId(req.params.id);
        if (!id) throw new AccessError("invalid_input", 400);
        return db.$transaction(async (tx) => {
          await lockWorkstationFlow(tx, id);
          const principal = await resolveSession(tx, requestAccess(req));
          assertPermission(principal, "workstations.manage");
          const station = await tx.workstation.findUnique({
            where: { id },
            include: { admission: true },
          });
          if (!station?.admission || station.admission.status !== "pending")
            throw new AccessError("admission_not_pending", 409);
          const approved = req.body.decision === "approve";
          const now = new Date();
          const updated = await tx.workstation.update({
            where: { id },
            data: {
              name: station.name || station.admission.requestedName,
              active: approved,
              pendingApproval: false,
              allowOperational: approved && req.body.allowOperational,
              allowBi: approved && req.body.allowBi,
              allowPriorities: approved && req.body.allowPriorities,
            },
          });
          await tx.workstationAdmission.update({
            where: { workstationId: id },
            data: {
              status: approved ? "approved" : "rejected",
              decidedAt: now,
              decidedByUserId: principal.userId,
              decisionReason: reason,
            },
          });
          await tx.accessSession.updateMany({
            where: { workstationId: id, revokedAt: null },
            data: { revokedAt: now },
          });
          await appendAudit(tx, actorFromPrincipal(principal), {
            action: approved ? "workstation.admission.approved" : "workstation.admission.rejected",
            resourceType: "workstation",
            resourceId: id,
            reason,
            before: {
              active: station.active,
              pendingApproval: station.pendingApproval,
              admissionStatus: station.admission.status,
            },
            after: {
              active: updated.active,
              pendingApproval: updated.pendingApproval,
              allowOperational: updated.allowOperational,
              allowBi: updated.allowBi,
              allowPriorities: updated.allowPriorities,
              admissionStatus: approved ? "approved" : "rejected",
            },
          });
          return { ok: true };
        });
      },
    );
  });
}
