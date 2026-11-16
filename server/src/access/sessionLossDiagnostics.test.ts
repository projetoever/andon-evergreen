import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { diagnoseSessionLoss } from "./sessionLossDiagnostics.js";

const secret = "a".repeat(64);
const now = new Date("2026-11-16T12:00:00.000Z");
const ago = new Date("2026-11-12T10:00:00.000Z");

function reader(change: {
  found?: boolean; revoked?: boolean; stationId?: string; expires?: Date;
  lastInteraction?: Date; persistent?: boolean; policy?: string; trusted?: boolean;
  accountActive?: boolean; authorizationChanged?: boolean; stationActive?: boolean;
  pending?: boolean; passwordRequired?: boolean; privileged?: boolean;
  permissions?: number;
} = {}) {
  const row = {
    workstationId: change.stationId ?? "ws_one",
    revokedAt: change.revoked ? ago : null,
    persistentOperational: change.persistent ?? true,
    expiresAt: change.expires ?? ago,
    lastInteractionAt: change.lastInteraction ?? ago,
    authorizationVersion: change.authorizationChanged ? 2 : 1,
    user: {
      sessionPolicy: change.policy ?? "persistent", active: change.accountActive ?? true,
      authorizationVersion: 1, accountType: "person", mustChangePassword: change.passwordRequired ?? false,
      isPrimaryAdmin: change.privileged ?? false,
      permissions: Array.from({ length: change.permissions ?? 1 }, () => ({ key: "andon.read" })),
      machines: [{ machineId: "37" }],
    },
    workstation: {
      active: change.stationActive ?? true, pendingApproval: change.pending ?? false,
      allowPersistentOperationalLogin: change.trusted ?? true,
    },
  };
  return { accessSession: {
    findUnique: async () => change.found === false ? null : row,
  } } as unknown as Pick<Prisma.TransactionClient, "accessSession">;
}

test("P0 Firefox diagnostic: cookie missing and unknown are neutral and non-authenticating", async () => {
  assert.equal(await diagnoseSessionLoss(reader(), "", "ws_one", now), "cookie_missing");
  assert.equal(await diagnoseSessionLoss(reader(), "bad-token", "ws_one", now), "cookie_unrecognized");
  assert.equal(await diagnoseSessionLoss(reader(), secret, "", now), "workstation_identity_missing");
  assert.equal(await diagnoseSessionLoss(reader({ found: false }), secret, "ws_one", now), "cookie_unrecognized");
});

test("P0 Firefox diagnostic distinguishes revocation, workstation change and session timeout", async () => {
  const cases: [Parameters<typeof reader>[0], string, string][] = [
    [{ revoked: true }, "ws_one", "session_revoked"],
    [{ stationId: "ws_two" }, "ws_one", "workstation_identity_changed"],
    [{ accountActive: false }, "ws_one", "account_security_changed"],
    [{ authorizationChanged: true }, "ws_one", "account_security_changed"],
    [{ stationActive: false }, "ws_one", "workstation_blocked"],
    [{ pending: true }, "ws_one", "workstation_blocked"],
    [{ trusted: false }, "ws_one", "session_unavailable"],
    [{ policy: "standard" }, "ws_one", "persistent_trust_removed"],
    [{ permissions: 0 }, "ws_one", "persistent_trust_removed"],
    [{ persistent: false }, "ws_one", "session_expired"],
    [{ persistent: false, policy: "daily", expires: new Date("2026-11-17T12:00:00Z") },
      "ws_one", "session_unavailable"],
  ];
  for (const [change, stationId, reason] of cases)
    assert.equal(await diagnoseSessionLoss(reader(change), secret, stationId, now), reason, JSON.stringify(change));
});

test("P0 Firefox diagnostic: no plaintext token, hash, login or private identifiers in response", async () => {
  for (const code of ["session_revoked", "workstation_identity_changed", "session_expired"]) {
    const value = await diagnoseSessionLoss(reader({
      revoked: code === "session_revoked",
      stationId: code === "workstation_identity_changed" ? "different" : "ws_one",
      persistent: code !== "session_expired",
    }), secret, "ws_one", now);
    assert.equal(value, code);
    assert.doesNotMatch(value, /ws_|[a-f0-9]{32}|login|password|token/);
  }
});
