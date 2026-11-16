import type { Prisma } from "@prisma/client";
import { tokenHash } from "./credentials.js";

export type SessionLossCode =
  | "cookie_missing"
  | "workstation_identity_missing"
  | "cookie_unrecognized"
  | "session_revoked"
  | "workstation_identity_changed"
  | "session_expired"
  | "account_security_changed"
  | "workstation_blocked"
  | "persistent_trust_removed"
  | "session_unavailable";

/** Evidence only. Never authorizes access or repairs a missing token.
 * The endpoint returns just a small reason code, never token, hash, user,
 * cookie, personal data or internal database IDs. High-entropy token lookup
 * only occurs for a cookie already supplied in this same HTTPS request.
 */
export async function diagnoseSessionLoss(
  db: Pick<Prisma.TransactionClient, "accessSession">,
  token: string,
  workstationId: string,
  now = new Date(),
): Promise<SessionLossCode> {
  if (!token) return "cookie_missing";
  if (!/^[a-f0-9]{64}$/.test(token)) return "cookie_unrecognized";
  if (!workstationId) return "workstation_identity_missing";
  const session = await db.accessSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { include: { permissions: true, machines: true } }, workstation: true },
  });
  if (!session) return "cookie_unrecognized";
  if (session.revokedAt) return "session_revoked";
  if (session.workstationId !== workstationId) return "workstation_identity_changed";
  if (!session.user.active || session.authorizationVersion !== session.user.authorizationVersion ||
      session.user.mustChangePassword) return "account_security_changed";
  if (!session.workstation.active || session.workstation.pendingApproval)
    return "workstation_blocked";
  if (session.persistentOperational &&
      (session.user.sessionPolicy !== "persistent" || session.user.accountType !== "person" ||
        session.user.isPrimaryAdmin || !session.workstation.allowPersistentOperationalLogin ||
        session.user.permissions.length === 0))
    return "persistent_trust_removed";
  if (!session.persistentOperational &&
      (session.expiresAt <= now ||
        (session.user.sessionPolicy !== "daily" &&
          session.lastInteractionAt.getTime() + 30 * 60 * 1000 <= now.getTime())))
    return "session_expired";
  return "session_unavailable";
}
