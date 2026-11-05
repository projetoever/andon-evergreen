import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Runs only on disposable CI PostgreSQL. NEVER against notebook HML or andon_db.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" ||
    url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1") {
  throw Error("Kiosk trust schema integration requires /andon_test with central writes disabled");
}
const db = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const wsId = "ws_" + randomUUID();
const machineId = "ci-kiosk-" + suffix;
const login = "ci.kiosk." + suffix;
let userId, leaseId;

try {
  const constraints = await db.$queryRaw`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'kiosk_trust_leases'::regclass
      AND conname IN ('kiosk_trust_status_check',
                      'kiosk_trust_version_check',
                      'kiosk_trust_approval_check',
                      'kiosk_trust_revoked_check',
                      'kiosk_trust_pending_check',
                      'kiosk_trust_token_hash_check')
    ORDER BY conname`;
  assert.equal(constraints.length, 6, "all fail-closed DB constraints must be installed");

  await db.machine.create({ data: { id: machineId, name: "CI kiosk schema only", isActive: true } });
  await db.workstation.create({ data: {
    id: wsId, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "CI isolated kiosk (not authenticated)",
    roleLabel: "Produção", accountType: "kiosk", isPrimaryAdmin: false,
    machineScope: "selected", active: true, mustChangePassword: false,
    passwordHash: "CI unusable password fixture",
    permissions: { create: [{ key: "andon.read" }, { key: "calls.open" }] },
    machines: { create: [{ machineId }] },
  } });
  userId = user.id;

  const pending = await db.kioskTrustLease.create({ data: {
    workstationId: wsId, kioskUserId: userId, machineId,
  } });
  leaseId = pending.id;
  assert.equal(pending.status, "pending");
  assert.equal(pending.authorizationVersion, 1);
  assert.equal(pending.credentialVersion, 1);
  assert.equal(pending.refreshTokenHash, null);
  assert.equal(pending.devicePublicKeySpki, null);
  assert.equal(pending.approvedByUserId, null);
  assert.equal(pending.expiresAt, null);
  assert.equal(await db.accessSession.count({ where: { userId } }), 0,
    "schema creation must not issue or prolong human sessions");

  await assert.rejects(
    db.kioskTrustLease.update({ where: { id: leaseId }, data: { status: "active" } }),
    "the DB must reject active trust without real approval and credential proof",
  );
  assert.equal((await db.kioskTrustLease.findUniqueOrThrow({
    where: { id: leaseId },
  })).status, "pending");

  await assert.rejects(
    db.kioskTrustLease.update({ where: { id: leaseId }, data: { status: "revoked" } }),
    "revocation requires a timestamp",
  );
  const revoked = await db.kioskTrustLease.update({
    where: { id: leaseId }, data: { status: "revoked", revokedAt: new Date() },
  });
  assert.equal(revoked.status, "revoked");
  assert(revoked.revokedAt instanceof Date);
  assert.equal(await db.accessSession.count({ where: { userId } }), 0);
  console.log("R10-04 B: additive kiosk schema, negative constraints and no-login invariant verified");
} finally {
  if (leaseId) await db.kioskTrustLease.deleteMany({ where: { id: leaseId } });
  if (userId) {
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: wsId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  await db.$disconnect();
}
