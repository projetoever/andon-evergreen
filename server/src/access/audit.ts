import { Prisma, type PrismaClient } from "@prisma/client";
import type { Principal } from "./policy.js";

export type AuditActor = {
  actorType: "user" | "legacy_admin" | "legacy_unidentified" | "service";
  actorUserId?: string;
  actorLogin?: string;
  actorName?: string;
  actorRole?: string;
  workstationId?: string;
  sessionId?: string;
  ipAddress?: string;
  requestId?: string;
};
export function actorFromPrincipal(principal: Principal): AuditActor {
  return {
    actorType: "user",
    actorUserId: principal.userId,
    actorLogin: principal.login,
    actorName: principal.displayName,
    actorRole: principal.roleLabel,
    workstationId: principal.workstationId,
    sessionId: principal.sessionId,
  };
}
// Snapshots are allowlisted by the business service; this additional filter
// prevents nested secret fields from accidentally reaching durable logs.
const secretKey =
  /password|credential|token|cookie|authorization|pinhash|taghash|rfid|connectionstring|secret|^pin$|^tag$/i;
export function redactAudit(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (depth > 8) return "[depth limit]";
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : "[invalid number]";
  if (Array.isArray(value)) return value.slice(0, 200).map((row) => redactAudit(row, depth + 1));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, item]) => item !== undefined && !secretKey.test(key))
        .slice(0, 100)
        .map(([key, item]) => [key, redactAudit(item, depth + 1)]),
    );
  return "[unsupported]";
}
export type AuditDetail = {
  action: string;
  resourceType: string;
  resourceId?: string;
  machineId?: string;
  result?: "success" | "denied" | "failure";
  reason?: string;
  before?: unknown;
  after?: unknown;
};
export async function appendAudit(
  tx: Prisma.TransactionClient,
  actor: AuditActor,
  detail: AuditDetail,
) {
  return tx.auditEvent.create({
    data: {
      ...actor,
      action: detail.action,
      resourceType: detail.resourceType,
      resourceId: detail.resourceId,
      machineId: detail.machineId,
      result: detail.result ?? "success",
      reason: detail.reason,
      ...(detail.before === undefined
        ? {}
        : { before: redactAudit(detail.before) ?? Prisma.JsonNull }),
      ...(detail.after === undefined
        ? {}
        : { after: redactAudit(detail.after) ?? Prisma.JsonNull }),
    },
  });
}
export function auditedMutation<T>(
  db: PrismaClient,
  actor: AuditActor,
  detail: AuditDetail,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    const result = await mutation(tx);
    await appendAudit(tx, actor, detail);
    return result;
  });
}
