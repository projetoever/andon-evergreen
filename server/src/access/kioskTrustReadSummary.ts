/**
 * R10-04 C1: sanitized, read-only status for Hub workstation inventory.
 * No credential, public key, key fingerprint, user ID or token leaves the API.
 * "active" in a database record does NOT mean kiosk authentication is enabled.
 */
export type KioskTrustReadState =
  | "not_configured"
  | "pending"
  | "revoked"
  | "expired"
  | "provisioned_inactive";

export type KioskTrustReadSummary = {
  state: KioskTrustReadState;
  machineId: string | null;
  expiresAt: Date | null;
};

export function kioskTrustReadSummary(
  lease: {
    status: string;
    machineId: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
  } | null,
  now: Date = new Date(),
): KioskTrustReadSummary {
  if (!lease) return { state: "not_configured", machineId: null, expiresAt: null };
  const payload = {
    machineId: lease.machineId,
    expiresAt: lease.expiresAt,
  };
  if (lease.revokedAt || lease.status === "revoked")
    return { ...payload, state: "revoked" };
  if (lease.status !== "active")
    return { ...payload, state: "pending" };
  if (!lease.expiresAt || !Number.isFinite(lease.expiresAt.getTime()) ||
      !Number.isFinite(now.getTime()) || lease.expiresAt <= now)
    return { ...payload, state: "expired" };
  // Even a valid-looking DB row is not a verified browser device or live session.
  return { ...payload, state: "provisioned_inactive" };
}
