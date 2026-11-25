import { Prisma, type PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { appendAudit, actorFromPrincipal } from "../access/audit.js";
import { AccessError, assertPermission } from "../access/policy.js";
import { resolveSession, type AccessRequest } from "../access/sessions.js";

/** The database remains the source of truth: browser clicks are explicitly
 * distinguished from verified server-side mutations and access decisions. */
type AuditQuery = {
  page?: number;
  from?: string;
  to?: string;
  action?: string;
  actor?: string;
  search?: string;
};
const PAGE_SIZE = 50;
export const MAX_AUDIT_EXPORT_ROWS = 20000;
const queryProperties = {
  page: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
  from: { type: "string", maxLength: 10 },
  to: { type: "string", maxLength: 10 },
  action: { type: "string", maxLength: 100 },
  actor: { type: "string", maxLength: 100 },
  search: { type: "string", maxLength: 120 },
};
const querySchema = {
  querystring: { type: "object", additionalProperties: false, properties: queryProperties },
};
function utcBoundary(value: string, end = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AccessError("invalid_input", 400);
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new AccessError("invalid_input", 400);
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
export function auditWhere(query: AuditQuery): Prisma.AuditEventWhereInput {
  const from = query.from ? utcBoundary(query.from) : undefined;
  const to = query.to ? utcBoundary(query.to, true) : undefined;
  if (from && to && from >= to) throw new AccessError("invalid_input", 400);
  const search = query.search?.trim();
  return {
    ...(from || to ? { occurredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(query.action?.trim() ? { action: { contains: query.action.trim(), mode: "insensitive" as const } } : {}),
    ...(query.actor?.trim() ? { OR: [
      { actorLogin: { contains: query.actor.trim(), mode: "insensitive" as const } },
      { actorName: { contains: query.actor.trim(), mode: "insensitive" as const } },
    ] } : {}),
    ...(search ? { AND: [{ OR: [
      { action: { contains: search, mode: "insensitive" as const } },
      { resourceType: { contains: search, mode: "insensitive" as const } },
      { resourceId: { contains: search, mode: "insensitive" as const } },
      { machineId: { contains: search, mode: "insensitive" as const } },
      { workstationId: { contains: search, mode: "insensitive" as const } },
      { reason: { contains: search, mode: "insensitive" as const } },
    ] }] } : {}),
  };
}
const auditOrder = [{ occurredAt: "desc" as const }, { id: "desc" as const }];
const safePage = /^\/(?:$|hub(?:\/admin)?$|andon(?:\/admin)?$|bi$|machine-priorities$|history$|active-calls$|settings$|machines\/[a-zA-Z0-9_-]{1,80}(?:\/(?:call-history|failure-history))?$)/;
export function isSafeAuditPage(page: string): boolean { return safePage.test(page); }
const csvColumns = [
  "occurredAt", "id", "actorType", "actorLogin", "actorName", "actorRole",
  "workstationId", "ipAddress", "action", "resourceType", "resourceId",
  "machineId", "result", "reason", "before", "after",
] as const;
export function auditCsvCell(value: unknown): string {
  const str = value == null ? "" : value instanceof Date ? value.toISOString() :
    typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet clients interpret cells beginning with =, +, -, @, CR or TAB
  // as formulas. Preserve evidence as inert text even after CSV export.
  const safe = /^[=+\-@\t\r\n]/.test(str) ? "'" + str : str;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function auditCsv(rows: ReadonlyArray<object>) {
  const lines = [csvColumns.join(";")];
  for (const item of rows) {
    const row = item as Record<string, unknown>;
    lines.push(csvColumns.map(key => auditCsvCell(row[key])).join(";"));
  }
  return "\ufeff" + lines.join("\r\n") + "\r\n";
}

export function registerAccessAuditRoutes(
  app: FastifyInstance,
  db: PrismaClient,
  requestAccess: (request: FastifyRequest) => AccessRequest,
  limited: (key: string, count: number, windowMs: number) => void,
) {
  app.get<{ Querystring: AuditQuery }>("/api/access/audit-events", { schema: querySchema }, async (req) => {
    const principal = await resolveSession(db, requestAccess(req));
    assertPermission(principal, "audit.read");
    const where = auditWhere(req.query);
    const [rows, total] = await db.$transaction([
      db.auditEvent.findMany({
        where, orderBy: auditOrder, skip: (req.query.page ?? 0) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.auditEvent.count({ where }),
    ]);
    await appendAudit(db, actorFromPrincipal(principal), {
      action: "audit.view", resourceType: "audit", after: { filters: Object.keys(req.query).sort() },
    });
    return { rows, total, page: req.query.page ?? 0, pageSize: PAGE_SIZE };
  });

  app.get<{ Querystring: AuditQuery }>("/api/access/audit-events/export", { schema: querySchema }, async (req, reply) => {
    const principal = await resolveSession(db, requestAccess(req));
    assertPermission(principal, "audit.read");
    assertPermission(principal, "audit.export");
    const where = auditWhere(req.query);
    const total = await db.auditEvent.count({ where });
    if (total > MAX_AUDIT_EXPORT_ROWS)
      throw new AccessError("audit_export_limit", 413);
    const rows = await db.auditEvent.findMany({ where, orderBy: auditOrder, take: MAX_AUDIT_EXPORT_ROWS });
    await appendAudit(db, actorFromPrincipal(principal), {
      action: "audit.export", resourceType: "audit", after: { exported: rows.length },
    });
    reply.header("Content-Disposition", 'attachment; filename="andon-auditoria.csv"');
    reply.header("X-Content-Type-Options", "nosniff");
    return reply.type("text/csv; charset=utf-8").send(auditCsv(rows));
  });

  // Browser-generated metadata is non-authoritative. Only fixed page paths and
  // control categories are accepted; never receive values, labels or input text.
  app.post<{ Body: { page: string } }>("/api/access/audit-events/navigation", {
    schema: { body: { type: "object", additionalProperties: false, required: ["page"],
      properties: { page: { type: "string", maxLength: 160 } } } },
  }, async (req) => {
    if (!safePage.test(req.body.page)) throw new AccessError("invalid_input", 400);
    const principal = await resolveSession(db, requestAccess(req));
    limited("audit:navigation:" + principal.userId, 120, 60000);
    await appendAudit(db, actorFromPrincipal(principal), {
      action: "ui.route.view", resourceType: "interface", resourceId: req.body.page,
    });
    return { ok: true };
  });

  app.post<{ Body: { events: { page: string; control: string; action?: string }[] } }>(
    "/api/access/audit-events/interactions",
    { schema: { body: { type: "object", additionalProperties: false, required: ["events"],
      properties: { events: { type: "array", minItems: 1, maxItems: 24,
        items: { type: "object", additionalProperties: false, required: ["page", "control"],
          properties: {
            page: { type: "string", maxLength: 160 },
            control: { enum: ["button", "link", "checkbox", "radio", "tab"] },
            action: { type: "string", maxLength: 80, pattern: "^[a-z][a-z0-9_.-]*$" },
          } },
      } } } } },
    async (req) => {
      if (req.body.events.some(event => !safePage.test(event.page)))
        throw new AccessError("invalid_input", 400);
      const principal = await resolveSession(db, requestAccess(req));
      limited("audit:click:" + principal.userId, 30, 60000);
      await db.$transaction(async tx => {
        for (const event of req.body.events)
          await appendAudit(tx, actorFromPrincipal(principal), {
            action: "ui.click", resourceType: "interface", resourceId: event.page,
            after: { control: event.control, ...(event.action ? { action: event.action } : {}) },
          });
      });
      return { ok: true };
    },
  );
}
