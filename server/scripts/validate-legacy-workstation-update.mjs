import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { createAdminSession, enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { registerWorkstationRoutes } from "../dist/routes/workstations.js";

if (
  process.env.ANDON_INTEGRATION_TEST !== "1" ||
  new URL(process.env.DATABASE_URL ?? "").pathname !== "/andon_test" ||
  process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1"
) throw Error("Use isolated andon_test with legacy administration only");

const db = new PrismaClient();
const app = Fastify({ logger: false });
app.addHook("preHandler", enforceWorkstationAccess);
app.addHook("preHandler", enforceAdminAuthorization);
await registerWorkstationRoutes(app);

const suffix = randomUUID();
const adminStation = `ws_${randomUUID()}`;
const activeStation = `ws_${randomUUID()}`;
const pendingStation = `ws_${randomUUID()}`;
const rejectedStation = `ws_${randomUUID()}`;
const tokenHash = `legacy-fixture-token-${suffix}`;
let userId = null;

const auth = createAdminSession("admin");
const headers = {
  authorization: `Bearer ${auth.token}`,
  "x-andon-workstation-id": adminStation,
};
async function update(station, body, status = 200, authorized = true) {
  const response = await app.inject({
    method: "PATCH",
    url: `/api/workstations/${station}`,
    headers: authorized ? headers : { "x-andon-workstation-id": adminStation },
    payload: body,
  });
  assert.equal(
    response.statusCode, status,
    `PATCH ${station}: ${response.statusCode} ${response.body}`,
  );
  return response.json();
}

try {
  await db.workstation.createMany({
    data: [
      { id: adminStation, active: true, pendingApproval: false },
      { id: activeStation, active: true, pendingApproval: false },
      { id: pendingStation, active: false, pendingApproval: true },
      { id: rejectedStation, active: false, pendingApproval: false },
    ],
  });
  const user = await db.accessUser.create({
    data: {
      login: `legacy-fixture-${suffix}`,
      displayName: "Test identity",
      roleLabel: "Technician",
      passwordHash: "isolated-fixture-not-a-credential",
      active: true,
    },
  });
  userId = user.id;
  await db.workstationAdmission.create({
    data: {
      workstationId: pendingStation,
      requesterUserId: userId,
      status: "pending",
    },
  });
  await db.workstationAdmission.create({
    data: {
      workstationId: rejectedStation,
      requesterUserId: userId,
      status: "rejected",
      decidedAt: new Date(),
      decisionReason: "Fixture rejection",
    },
  });
  const session = await db.accessSession.create({
    data: {
      tokenHash,
      userId,
      workstationId: activeStation,
      purpose: "normal",
      authorizationVersion: 1,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  await update(activeStation, { name: "Unauthorized rename" }, 401, false);
  const noAuth = await db.workstation.findUniqueOrThrow({ where: { id: activeStation } });
  assert.equal(noAuth.name, null);

  await update(pendingStation, { active: true }, 400);
  await update(pendingStation, { name: "Bypass approval" }, 400);
  await update(rejectedStation, { active: true }, 400);
  const [pending, rejected] = await Promise.all([
    db.workstation.findUniqueOrThrow({ where: { id: pendingStation } }),
    db.workstation.findUniqueOrThrow({ where: { id: rejectedStation } }),
  ]);
  assert.equal(pending.pendingApproval, true);
  assert.equal(pending.active, false);
  assert.equal(rejected.active, false);

  const renamed = await update(activeStation, { name: "Legacy isolated workstation" });
  assert.equal(renamed.name, "Legacy isolated workstation");
  const moduleRestricted = await update(activeStation, { allowOperational: false });
  assert.equal(moduleRestricted.allowOperational, false);
  assert.equal(
    (await db.accessSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    null,
    "disabling a module should preserve session (same rule as central management)",
  );

  const disabled = await update(activeStation, { active: false });
  assert.equal(disabled.active, false);
  const revoked = await db.accessSession.findUniqueOrThrow({ where: { id: session.id } });
  assert(revoked.revokedAt instanceof Date, "deactivation must revoke linked central session");

  const reactivated = await update(activeStation, { active: true });
  assert.equal(reactivated.active, true);
  assert(
    (await db.accessSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    "reactivation must not resurrect revoked sessions",
  );

  const audits = await db.auditEvent.findMany({
    where: { action: "workstation.access.updated", resourceId: activeStation },
    orderBy: { occurredAt: "asc" },
  });
  assert.equal(audits.length, 4);
  for (const event of audits) {
    assert.equal(event.actorType, "legacy_admin");
    assert.equal(event.actorLogin, "admin");
    assert.equal(event.resourceType, "workstation");
    assert.equal(event.workstationId, adminStation);
    assert(event.before && event.after, "change must have both audit snapshots");
    assert.equal(event.result, "success");
    assert.equal(JSON.stringify(event).includes(auth.token), false);
    assert.equal(JSON.stringify(event).includes(tokenHash), false);
  }
  assert(
    audits.some((event) => event.before.active === true && event.after.active === false),
    "audit must contain deactivation state transition",
  );
  assert.equal(
    await db.auditEvent.count({
      where: { action: "workstation.access.updated", resourceId: pendingStation },
    }), 0,
    "rejected administration must not create a successful mutation audit",
  );

  console.log("SEC-04/2A.8 legacy workstation integration: PASS (admission, revocation, audit, reactivation)");
} finally {
  // Audit rows are append-only; isolated test workstations and users can be removed.
  await db.accessSession.deleteMany({ where: { workstationId: { in: [adminStation, activeStation, pendingStation, rejectedStation] } } });
  await db.workstationAdmission.deleteMany({ where: { workstationId: { in: [pendingStation, rejectedStation] } } });
  if (userId) await db.accessUser.delete({ where: { id: userId } });
  await db.workstation.deleteMany({ where: { id: { in: [adminStation, activeStation, pendingStation, rejectedStation] } } });
  await app.close();
  await db.$disconnect();
}
