/**
 * R9-05/06 (phase A) — PURE, dormant kiosk authorization contract.
 *
 * This module does not issue sessions, set cookies, read client claims, or
 * register endpoints. The only authoritative inputs must eventually be read
 * and revalidated by the server under transactional locks.
 *
 * A browser workstation UUID, IP, hostname, user-agent or heartbeat is never
 * a cryptographic device proof. The optional ANDON agent is not involved.
 */
export const KIOSK_OPERATIONS = ["andon.read", "calls.open"] as const;
export type KioskOperation = (typeof KIOSK_OPERATIONS)[number];
export type KioskDenial =
  | "feature_disabled"
  | "station_denied"
  | "account_denied"
  | "grant_denied"
  | "scope_denied"
  | "trust_denied"
  | "device_proof_required"
  | "lease_expired"
  | "action_denied";

type KioskAccount = {
  active: boolean;
  accountType: string;
  isPrimaryAdmin: boolean;
  mustChangePassword: boolean;
  machineScope: string;
  machineIds: readonly string[];
  permissions: readonly string[];
  authorizationVersion: number;
};
type Station = { id: string; active: boolean; pendingApproval: boolean };
type Lease = {
  workstationId: string;
  machineId: string;
  approvedByPrimaryAdmin: boolean;
  approved: boolean;
  authorizationVersion: number;
  revokedAt: Date | null;
  expiresAt: Date;
};
export type KioskTrustPolicyInput = {
  /** Must be an explicit backend feature flag. Defaults OFF in the caller. */
  featureEnabled: boolean;
  centralAccessEnabled: boolean;
  account: KioskAccount;
  station: Station | null;
  /** Server-selected lease row, never a client-provided object. */
  lease: Lease | null;
  /** Server-verified proof-of-possession, not a browser claim/heartbeat. */
  deviceProofVerified: boolean;
  machineId: string;
  operation: string;
  now: Date;
};
export type KioskTrustDecision =
  | { allowed: false; reason: KioskDenial }
  | { allowed: true; operation: KioskOperation; machineId: string };

/**
 * Grant only a machine-bound, least-privilege operational kiosk action.
 * A human Admin/Production session NEVER becomes perpetual through this.
 * No route may use this decision without a separate authenticated/locked
 * server-side identity, lease, and authorization-version verification.
 */
export function evaluateKioskTrust(input: KioskTrustPolicyInput): KioskTrustDecision {
  const deny = (reason: KioskDenial): KioskTrustDecision => ({ allowed: false, reason });
  if (!input.featureEnabled || !input.centralAccessEnabled) return deny("feature_disabled");
  const station = input.station;
  if (!station?.id || !station.active || station.pendingApproval) return deny("station_denied");
  const account = input.account;
  if (!account.active || account.accountType !== "kiosk" ||
      account.isPrimaryAdmin || account.mustChangePassword)
    return deny("account_denied");
  const grants = account.permissions;
  if (!Array.isArray(grants) ||
      grants.length !== KIOSK_OPERATIONS.length ||
      new Set(grants).size !== KIOSK_OPERATIONS.length ||
      KIOSK_OPERATIONS.some((grant) => !grants.includes(grant)))
    return deny("grant_denied");
  if (!input.machineId || account.machineScope !== "selected" ||
      !Array.isArray(account.machineIds) ||
      account.machineIds.length !== 1 ||
      account.machineIds[0] !== input.machineId)
    return deny("scope_denied");
  const lease = input.lease;
  if (!lease || !lease.approved || !lease.approvedByPrimaryAdmin ||
      lease.workstationId !== station.id || lease.machineId !== input.machineId ||
      !Number.isInteger(lease.authorizationVersion) ||
      lease.authorizationVersion !== account.authorizationVersion ||
      lease.revokedAt !== null)
    return deny("trust_denied");
  if (!input.deviceProofVerified) return deny("device_proof_required");
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) ||
      !(lease.expiresAt instanceof Date) ||
      !Number.isFinite(lease.expiresAt.getTime()) ||
      lease.expiresAt <= input.now)
    return deny("lease_expired");
  if (!KIOSK_OPERATIONS.some((operation) => operation === input.operation))
    return deny("action_denied");
  return { allowed: true, operation: input.operation as KioskOperation, machineId: input.machineId };
}
