import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerMachineSubsetRoutes } from "../dist/routes/machineSubsets.js";
import {
  createCentralMachineSubset, updateCentralMachineSubset,
} from "../dist/access/centralMachineSubsetSettings.js";

// No industrial or HML DB under any circumstances. Do not enable this flag
// outside this disposable integration process.
const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || dbUrl.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED === "1")
  throw Error("R12-04D2 runs ONLY on isolated /andon_test with central flags OFF initially");

const db = new PrismaClient();
const contender = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci04d2-machine-" + n;
const setId = "ci04d2-set-" + n;
const subsetTypeId = "ci04d2-type-" + n;
const stations = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [];
let callId;
let app;
const previous = {
  access: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  subset: process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
function restore(key, oldValue) {
  if (oldValue === undefined) delete process.env[key];
  else process.env[key] = oldValue;
}
function body(name, code) {
  return {
    name, code, typeId: subsetTypeId, description: "CI test component",
    manufacturer: "Evergreen CI", model: "M-" + n, assetTag: "CI-" + code,
    isActive: true, displayOrder: 0,
  };
}
const audits = (id, action) => db.auditEvent.findMany({
  where: { resourceType: "machine_subset", resourceId: id, action },
});
function directCreate(client, index, payload, extra = {}) {
  return createCentralMachineSubset(client, {
    token: tokens[index], workstationId: stations[index],
    machineSetId: setId, body: payload, requestId: "ci04d2-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}
function directPatch(client, index, subsetId, payload, extra = {}) {
  return updateCentralMachineSubset(client, {
    token: tokens[index], workstationId: stations[index],
    subsetId, body: payload, requestId: "ci04d2-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}

try {
  await db.machine.create({ data: {
    id: machineId, name: "CI machine subsets " + n, isActive: true,
  } });
  await db.machineSet.create({ data: {
    id: setId, machineId, name: "CI set for subsets " + n,
    code: "ci_set_" + n, isActive: true,
  } });
  await db.machineSubsetType.create({ data: {
    id: subsetTypeId, code: "ci04d2_" + n,
    name: "CI bearing " + n, isActive: true,
  } });
  await db.workstation.createMany({ data: stations.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04d2.subsets." + i + "." + n,
      displayName: "CI subset delegate " + i,
      roleLabel: ["Produção", "Manutenção", "Gerente"][i],
      accountType: "person", active: true, isPrimaryAdmin: false,
      machineScope: "selected", passwordHash: "CI no password",
      mustChangePassword: false,
      permissions: { create: i < 2
        ? [{ key: "andon.read" }, { key: "andon.settings.open" }]
        : [{ key: "andon.read" }, { key: "catalog.assets.manage" }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id,
      workstationId: stations[i], purpose: "normal",
      authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    } });
  }
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "0";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";

  app = Fastify();
  app.addHook("onRequest", async req => {
    Object.defineProperty(req.raw.socket, "encrypted", {
      value: true, configurable: true,
    });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  app.addHook("preHandler", enforceModuleAuthorization);
  await registerMachineSubsetRoutes(app);
  function send(method, index, id, payload, headerExtra = {}) {
    return app.inject({
      method,
      url: id === null ? "/api/machine-sets/" + setId + "/subsets"
        : "/api/machine-subsets/" + id,
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": stations[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]),
        ...headerExtra,
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  const flagOff = await send("POST", 0, null, body("Bearing A", "bearing_a"));
  assert.equal(flagOff.statusCode, 403, flagOff.body);
  assert.equal(flagOff.json().error, "central_action_not_supported");
  process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "1";

  assert.equal((await send("POST", 0, null, body("Bearing A", "bearing_a"),
    { cookie: "" })).statusCode, 401);
  assert.equal((await send("POST", 0, null, body("Bearing A", "bearing_a"),
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send("POST", 0, null, body("Bearing A", "bearing_a"),
    { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await send("POST", 2, null, body("Bearing A", "bearing_a"))).statusCode, 403);
  for (const invalid of [
    { ...body("Bearing A", "bearing_a"), machineSetId: "another_parent" },
    { ...body("Bearing A", "bearing_a"), machineId: "another_machine" },
    { ...body("Bearing A", "bearing_a"), isActive: "true" },
    { ...body("Bearing A", "bearing_a"), identityVerified: true },
    { ...body("Bearing A", "bearing_a"), typeId: "missing" },
    { name: "Missing type" }, { typeId: subsetTypeId },
  ]) assert.equal((await send("POST", 0, null, invalid)).statusCode, 400);
  assert.equal(await db.machineSubset.count({ where: { machineSetId: setId } }), 0);

  const created = await send("POST", 0, null, body("Bearing A", "bearing_a"));
  assert.equal(created.statusCode, 201, created.body);
  const childId = created.json().id;
  assert.equal(created.json().subsetType.id, subsetTypeId);
  assert.equal((await audits(childId, "andon.machine_subset.settings.create")).length, 1);
  assert.equal((await send("POST", 0, null, body("Bearing B", "bearing_a"))).statusCode, 409);
  assert.equal((await send("GET", 1, null)).statusCode, 200);
  assert.equal((await send("GET", 2, null)).statusCode, 403);

  const edit = await send("PATCH", 1, childId, {
    code: "BEARING B", name: "Bearing B", manufacturer: "CI Lab",
    description: "CI new description", displayOrder: 4,
  });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(edit.json().code, "bearing_b");
  assert.equal(edit.json().manufacturer, "CI Lab");
  const editedAudit = (await audits(childId, "andon.machine_subset.settings.update"))[0];
  assert.equal(editedAudit.actorUserId, userIds[1]);
  assert.equal(editedAudit.workstationId, stations[1]);
  assert.equal(editedAudit.machineId, machineId);
  assert(!JSON.stringify(editedAudit).includes(tokens[1]));

  assert.equal((await send("DELETE", 0, childId)).statusCode, 403);
  assert.equal((await send("PATCH", 0, childId,
    { machineSetId: "foreign" })).statusCode, 400);

  const call = await db.andonCall.create({ data: {
    machineId, machineSetId: setId, machineSubsetId: childId,
    category: "maintenance", subtype: "mechanical",
    status: "open", criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;
  const live = await send("PATCH", 0, childId, { isActive: false });
  assert.equal(live.statusCode, 409, live.body);
  assert.equal(live.json().error, "asset_has_active_call");
  await db.andonCall.update({ where: { id: callId }, data: { status: "finished" } });
  const historical = await send("PATCH", 0, childId, { name: "Tampered historical name" });
  assert.equal(historical.statusCode, 409, historical.body);
  assert.equal(historical.json().error, "asset_has_history");
  const metadata = await send("PATCH", 0, childId, { manufacturer: "Evergreen" });
  assert.equal(metadata.statusCode, 200, metadata.body);
  assert.equal(metadata.json().manufacturer, "Evergreen");

  const before = await db.machineSubset.findUniqueOrThrow({ where: { id: childId } });
  await assert.rejects(directPatch(db, 0, childId, { model: "Must rollback" },
    { ipAddress: "x".repeat(46) }));
  assert.equal((await db.machineSubset.findUniqueOrThrow({ where: { id: childId } })).model,
    before.model);

  await db.machineSet.update({ where: { id: setId }, data: { isActive: false } });
  const parentInactive = await send("POST", 0, null, body("New bearing", "new_bearing"));
  assert.equal(parentInactive.statusCode, 409, parentInactive.body);
  assert.equal(parentInactive.json().error, "asset_parent_inactive");
  const reactivate = await send("PATCH", 0, childId, { isActive: true });
  assert.equal(reactivate.statusCode, 409, reactivate.body);
  assert.equal(reactivate.json().error, "asset_parent_inactive");
  await db.machineSet.update({ where: { id: setId }, data: { isActive: true } });

  const raceCode = "ci_bearing_race_" + n;
  const race = await Promise.allSettled([
    directCreate(db, 0, body("Race bearing A", raceCode)),
    directCreate(contender, 1, body("Race bearing B", raceCode)),
  ]);
  assert.equal(race.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(race.filter(x => x.status === "rejected").length, 1);
  assert.equal(race.find(x => x.status === "rejected").reason.code, "asset_code_in_use");
  const winner = race.find(x => x.status === "fulfilled").value;
  assert.equal((await audits(winner.id, "andon.machine_subset.settings.create")).length, 1);
  assert.equal(await db.machineSubset.count({
    where: { machineSetId: setId, code: raceCode },
  }), 1);

  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  assert.equal((await send("PATCH", 0, childId, { model: "Unauthorized" })).statusCode, 403);
  process.env.ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED = "0";
  const disabled = await send("PATCH", 1, childId, { model: "Flag off" });
  assert.equal(disabled.statusCode, 403);
  assert.equal(disabled.json().error, "central_action_not_supported");

  console.log("R12-04D2 machine-subset PG PASS: global role-agnostic settings, separate flag, CSRF/Origin, POST/PATCH, DELETE denied, historical/active calls, inactive parent, two-workstation race, atomic audit rollback, revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", previous.access);
  restore("ANDON_CENTRAL_MACHINE_SUBSET_SETTINGS_HTTP_ENABLED", previous.subset);
  restore("ANDON_ACCESS_ORIGIN", previous.origin);
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  await db.machineSubset.deleteMany({ where: { machineSetId: setId } });
  await db.machineSubsetType.deleteMany({ where: { id: subsetTypeId } });
  await db.machineSet.deleteMany({ where: { id: setId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: { in: stations } } });
  await contender.$disconnect();
  await db.$disconnect();
}
