import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerAndonCategoryRoutes } from "../dist/routes/andonCategories.js";
import {
  createCentralCategory, updateCentralCategory,
} from "../dist/access/centralCategorySettings.js";

const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || dbUrl.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED === "1")
  throw Error("R12-04C requires ONLY disposable PostgreSQL /andon_test and central flags OFF");

const db = new PrismaClient();
const other = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const categoryIds = [0, 1, 2].map(i => "ci04c_" + i + "_" + n);
const machineId = "ci04c-machine-" + n;
const workstationIds = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [], sessionIds = [];
let callId, technicianId, app;
const original = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  category: process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
const restore = (key, val) => {
  if (val === undefined) delete process.env[key];
  else process.env[key] = val;
};
function body(id) {
  return {
    id, displayName: "CI industrial sector " + id,
    categoryGroup: "maintenance", color: "#112233",
    active: true, displayOrder: 3,
  };
}
const audits = (id, action) => db.auditEvent.findMany({
  where: { resourceId: id, action },
});
const directCreate = (client, index, id, extra = {}) =>
  createCentralCategory(client, {
    token: tokens[index], workstationId: workstationIds[index],
    body: body(id), requestId: "CI-04C-" + n, ipAddress: "127.0.0.1", ...extra,
  });
const directUpdate = (client, index, id, patch, extra = {}) =>
  updateCentralCategory(client, {
    token: tokens[index], workstationId: workstationIds[index],
    categoryId: id, body: patch,
    requestId: "CI-04C-" + n, ipAddress: "127.0.0.1", ...extra,
  });

try {
  await db.workstation.createMany({ data: workstationIds.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04c.settings." + i + "." + n,
      displayName: "CI sector " + i, accountType: "person",
      roleLabel: i === 0 ? "Produção" : i === 1 ? "Manutenção" : "Gerente",
      active: true, isPrimaryAdmin: false, machineScope: "selected",
      passwordHash: "CI not used", mustChangePassword: false,
      permissions: { create: i < 2
        ? [{ key: "andon.read" }, { key: "andon.settings.open" }]
        : [{ key: "andon.read" }, { key: "catalog.reasons.manage" }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    const session = await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id,
      workstationId: workstationIds[i], purpose: "normal",
      authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    } });
    sessionIds.push(session.id);
  }
  await db.machine.create({ data: { id: machineId, name: "CI category live machine " + n } });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  app = Fastify();
  app.addHook("onRequest", async req =>
    Object.defineProperty(req.raw.socket, "encrypted",
      { value: true, configurable: true }));
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerAndonCategoryRoutes(app);
  function send(method, index, id, payload, extraHeaders = {}) {
    return app.inject({
      method, url: id ? "/api/andon-categories/" + id : "/api/andon-categories",
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": workstationIds[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]),
        ...extraHeaders,
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  const blocked = await send("POST", 0, null, body(categoryIds[0]));
  assert.equal(blocked.statusCode, 403, blocked.body);
  assert.equal(blocked.json().error, "central_action_not_supported");
  assert.equal(await db.andonCategory.count({
    where: { id: { in: categoryIds } },
  }), 0);
  process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "1";

  assert.equal((await send("POST", 0, null, body(categoryIds[0]),
    { cookie: "" })).statusCode, 401);
  assert.equal((await send("POST", 0, null, body(categoryIds[0]),
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send("POST", 0, null, body(categoryIds[0]),
    { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await send("POST", 2, null, body(categoryIds[0]))).statusCode, 403);
  for (const invalid of [
    { ...body(categoryIds[0]), categoryGroup: "quality" },
    { ...body(categoryIds[0]), pinHash: "secret" },
    { ...body(categoryIds[0]), color: "red" },
    { ...body(categoryIds[0]), id: "bad space" },
    { ...body(categoryIds[0]), active: "true" },
  ]) assert.equal((await send("POST", 0, null, invalid)).statusCode, 400);

  const created = await send("POST", 0, null, body(categoryIds[0]));
  assert.equal(created.statusCode, 201, created.body);
  assert.equal(created.json().id, categoryIds[0]);
  assert.equal((await audits(categoryIds[0], "andon.category.settings.create")).length, 1);
  assert.equal((await send("POST", 0, null, body(categoryIds[0]))).statusCode, 409);
  // A selected-machine human can read all category labels, not other machine calls.
  const list = await send("GET", 0, null);
  assert.equal(list.statusCode, 200, list.body);
  assert(list.json().some(category => category.id === categoryIds[0]));

  const edited = await send("PATCH", 1, categoryIds[0], {
    displayName: "CI Maintenance updated " + n,
    color: "#aabbcc", displayOrder: 7,
  });
  assert.equal(edited.statusCode, 200, edited.body);
  assert.equal(edited.json().color, "#AABBCC");
  const editAudits = await audits(categoryIds[0], "andon.category.settings.update");
  assert.equal(editAudits.length, 1);
  assert.equal(editAudits[0].actorUserId, userIds[1]);
  assert.equal(editAudits[0].workstationId, workstationIds[1]);
  assert.equal(editAudits[0].before.color, "#112233");
  assert.equal(editAudits[0].after.color, "#AABBCC");
  assert(!JSON.stringify(editAudits[0]).includes(tokens[1]));

  // A flag for editing sectors MUST NOT permit destructive DELETE.
  const deleteAttempt = await send("DELETE", 0, categoryIds[0]);
  assert.equal(deleteAttempt.statusCode, 403, deleteAttempt.body);

  // Changes that would reinterpret live or HISTORIC KPIs are forbidden.
  const call = await db.andonCall.create({ data: {
    machineId, category: "maintenance", subtype: categoryIds[0],
    status: "open", criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;
  const inactive = await send("PATCH", 0, categoryIds[0], { active: false });
  assert.equal(inactive.statusCode, 409, inactive.body);
  assert.equal(inactive.json().error, "category_has_active_call");
  await db.andonCall.update({ where: { id: callId }, data: { status: "finished" } });
  const regroup = await send("PATCH", 0, categoryIds[0], {
    categoryGroup: "production",
  });
  assert.equal(regroup.statusCode, 409, regroup.body);
  assert.equal(regroup.json().error, "category_has_history");
  assert.equal((await db.andonCategory.findUniqueOrThrow({
    where: { id: categoryIds[0] },
  })).categoryGroup, "maintenance");

  // Audit exception after a real write must rollback category state and event.
  const originalCategory = await db.andonCategory.findUniqueOrThrow({
    where: { id: categoryIds[0] },
  });
  await assert.rejects(directUpdate(db, 0, categoryIds[0], {
    displayName: "This should rollback " + n,
  }, { ipAddress: "x".repeat(46) }));
  assert.equal((await db.andonCategory.findUniqueOrThrow({
    where: { id: categoryIds[0] },
  })).displayName, originalCategory.displayName);
  assert.equal((await audits(categoryIds[0], "andon.category.settings.update")).length, 1);

  // Assignment of a technical category forbids changing its KPI group.
  const assigned = await send("POST", 0, null, body(categoryIds[1]));
  assert.equal(assigned.statusCode, 201, assigned.body);
  const technician = await db.technician.create({ data: {
    name: "CI sector technician " + n, employeeId: "CI04C-EMP-" + n,
    technicalArea: categoryIds[1],
    technicalAreas: { create: [{ technicalArea: categoryIds[1] }] },
  } });
  technicianId = technician.id;
  const assignedSwitch = await send("PATCH", 0, categoryIds[1], {
    categoryGroup: "production",
  });
  assert.equal(assignedSwitch.statusCode, 409, assignedSwitch.body);
  assert.equal(assignedSwitch.json().error, "category_in_use");

  // Two physical workstations and two PostgreSQL connections race to create
  // a sector with one ID. The losing transaction cannot leave a success audit.
  const race = await Promise.allSettled([
    directCreate(db, 0, categoryIds[2]),
    directCreate(other, 1, categoryIds[2]),
  ]);
  assert.equal(race.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(race.filter(x => x.status === "rejected").length, 1);
  assert.equal(race.find(x => x.status === "rejected").reason.code, "category_already_exists");
  assert.equal(await db.andonCategory.count({
    where: { id: categoryIds[2] },
  }), 1);
  assert.equal((await audits(categoryIds[2], "andon.category.settings.create")).length, 1);

  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  assert.equal((await send("POST", 0, null, body("ci04c_revoked_" + n))).statusCode, 403);
  process.env.ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED = "0";
  const disabledAgain = await send("PATCH", 1, categoryIds[0], {
    displayName: "Must remain blocked",
  });
  assert.equal(disabledAgain.statusCode, 403);
  assert.equal(disabledAgain.json().error, "central_action_not_supported");

  console.log("R12-04C categories PG PASS: flags, scoped human grants, CSRF/Origin, create/update, forbidden delete, active and historical call guard, technician area, two-workstation creation race, atomic audit rollback and revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", original.central);
  restore("ANDON_CENTRAL_CATEGORY_SETTINGS_HTTP_ENABLED", original.category);
  restore("ANDON_ACCESS_ORIGIN", original.origin);
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  if (technicianId) await db.technician.deleteMany({ where: { id: technicianId } });
  await db.andonCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: { in: workstationIds } } });
  await other.$disconnect();
  await db.$disconnect();
}
