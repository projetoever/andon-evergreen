import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerMachineSetRoutes } from "../dist/routes/machineSets.js";
import {
  createCentralMachineSet, updateCentralMachineSet,
} from "../dist/access/centralMachineSetSettings.js";

// Never run against HML, industrial or arbitrary databases, even with a
// valid-looking URL: the isolated CI database is specifically /andon_test.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED === "1") {
  throw Error("R12-04D1 requires disposable /andon_test and central flags OFF initially");
}

const db = new PrismaClient();
const other = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci04d1-machine-" + n;
const typeId = "ci04d1-type-" + n;
const stationIds = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [];
const sets = [];
let callId;
let subsetId;
let app;
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  sets: process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
const audits = (setId, action) => db.auditEvent.findMany({
  where: { resourceType: "machine_set", resourceId: setId, action },
});
function body(name, code = name.toLowerCase().replaceAll(" ", "_")) {
  return { name, code, typeId, description: "synthetic CI", isActive: true, displayOrder: 0 };
}
function directCreate(client, index, payload, extra = {}) {
  return createCentralMachineSet(client, {
    token: tokens[index], workstationId: stationIds[index],
    machineId, body: payload, requestId: "r12-04d1-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}
function directPatch(client, index, setId, payload, extra = {}) {
  return updateCentralMachineSet(client, {
    token: tokens[index], workstationId: stationIds[index],
    setId, body: payload, requestId: "r12-04d1-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}

try {
  await db.machine.create({ data: {
    id: machineId, name: "R12-04D1 test machine " + n, isActive: true,
  } });
  await db.machineSetType.create({ data: {
    id: typeId, code: "ci04d1_" + n, name: "Test spindle " + n, isActive: true,
  } });
  await db.workstation.createMany({ data: stationIds.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04d1.set." + i + "." + n,
      displayName: "R12 machine-set catalog delegate " + i,
      roleLabel: ["Produção", "Manutenção", "Gerente"][i],
      accountType: "person", active: true,
      isPrimaryAdmin: false, machineScope: "selected",
      passwordHash: "CI no password", mustChangePassword: false,
      permissions: { create: i < 2
        ? [{ key: "andon.read" }, { key: "andon.settings.open" }]
        : [{ key: "andon.read" }, { key: "catalog.assets.manage" }] },
    } });
    userIds.push(user.id);
    const now = new Date();
    await db.accessSession.create({ data: {
      tokenHash: tokenHash(tokens[i]), userId: user.id,
      workstationId: stationIds[i], purpose: "normal",
      authorizationVersion: user.authorizationVersion,
      createdAt: now, lastInteractionAt: now,
      expiresAt: new Date(now.getTime() + 3600000),
    } });
  }

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "0";
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
  await registerMachineSetRoutes(app);

  function send(method, index, id, payload, headers = {}) {
    const path = id === null
      ? "/api/machines/" + machineId + "/sets"
      : "/api/machine-sets/" + id;
    return app.inject({
      method, url: path,
      headers: {
        origin: "https://andon.test", "x-andon-workstation-id": stationIds[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]), ...headers,
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  const flagOff = await send("POST", 0, null, body("Main spindle", "spindle_main"));
  assert.equal(flagOff.statusCode, 403, flagOff.body);
  assert.equal(flagOff.json().error, "central_action_not_supported");
  assert.equal(await db.machineSet.count({ where: { machineId } }), 0);
  process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "1";

  assert.equal((await send("POST", 0, null, body("Main spindle", "spindle_main"),
    { cookie: "" })).statusCode, 401);
  assert.equal((await send("POST", 0, null, body("Main spindle", "spindle_main"),
    { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
  assert.equal((await send("POST", 0, null, body("Main spindle", "spindle_main"),
    { origin: "https://evil.invalid" })).statusCode, 403);
  assert.equal((await send("POST", 2, null, body("Main spindle", "spindle_main"))).statusCode, 403);
  for (const invalid of [
    { ...body("Main spindle", "spindle_main"), machineId: "M38" },
    { ...body("Main spindle", "spindle_main"), type: "legacy" },
    { ...body("Main spindle", "spindle_main"), pinHash: "spoof" },
    { ...body("Main spindle", "spindle_main"), isActive: "true" },
    { ...body("Main spindle", "spindle_main"), typeId: "missing" },
    { typeId }, { name: "Missing type" },
  ]) assert.equal((await send("POST", 0, null, invalid)).statusCode, 400);
  assert.equal(await db.machineSet.count({ where: { machineId } }), 0);

  const created = await send("POST", 0, null, body("Main spindle", "spindle_main"));
  assert.equal(created.statusCode, 201, created.body);
  const setId = created.json().id;
  sets.push(setId);
  assert.equal(created.json().setType.id, typeId);
  assert.equal((await audits(setId, "andon.machine_set.settings.create")).length, 1);
  assert.equal((await send("POST", 0, null,
    body("Duplicate spindle", "spindle_main"))).statusCode, 409);

  const listed = await send("GET", 1, null);
  assert.equal(listed.statusCode, 200, listed.body);
  assert(listed.json().some(row => row.id === setId));
  // A catalog-only person with selected machineScope is not a global settings
  // delegate and must not enumerate assets outside their operational scope.
  assert.equal((await send("GET", 2, null)).statusCode, 403);

  const changed = await send("PATCH", 1, setId, {
    name: "Spindle A", code: "SPINDLE A", description: "test of edit", displayOrder: 7,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal(changed.json().code, "spindle_a");
  const editedAudit = (await audits(setId, "andon.machine_set.settings.update"))[0];
  assert.equal(editedAudit.actorUserId, userIds[1]);
  assert.equal(editedAudit.workstationId, stationIds[1]);
  assert.equal(editedAudit.machineId, machineId);
  assert.equal(editedAudit.after.code, "spindle_a");
  assert(!JSON.stringify(editedAudit).includes(tokens[1]));

  const deniedDelete = await send("DELETE", 0, setId);
  assert.equal(deniedDelete.statusCode, 403, deniedDelete.body);
  const badParent = await send("PATCH", 0, setId, { machineId: "M38" });
  assert.equal(badParent.statusCode, 400, badParent.body);

  const call = await db.andonCall.create({ data: {
    machineId, machineSetId: setId, status: "open",
    category: "maintenance", subtype: "mechanical",
    criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;
  const live = await send("PATCH", 0, setId, { isActive: false });
  assert.equal(live.statusCode, 409, live.body);
  assert.equal(live.json().error, "asset_has_active_call");
  await db.andonCall.update({ where: { id: callId }, data: { status: "finished" } });
  const historical = await send("PATCH", 0, setId, { name: "Invalid historical rename" });
  assert.equal(historical.statusCode, 409, historical.body);
  assert.equal(historical.json().error, "asset_has_history");
  // Operational metadata which does not change the historical identity can
  // still be edited after a call is complete.
  const harmless = await send("PATCH", 0, setId, { description: "New documentation" });
  assert.equal(harmless.statusCode, 200, harmless.body);
  assert.equal(harmless.json().description, "New documentation");

  // Inactivating an asset with active child equipment is not permitted.
  const child = await db.machineSubset.create({ data: {
    machineSetId: setId, name: "CI child " + n,
    code: "ci_child_" + n, isActive: true,
  } });
  subsetId = child.id;
  const activeChild = await send("PATCH", 0, setId, { isActive: false });
  assert.equal(activeChild.statusCode, 409, activeChild.body);
  assert.equal(activeChild.json().error, "asset_has_active_subsets");

  // A failed audit insertion AFTER updating metadata must roll back.
  const before = await db.machineSet.findUniqueOrThrow({ where: { id: setId } });
  await assert.rejects(directPatch(db, 0, setId,
    { description: "Do not commit" }, { ipAddress: "x".repeat(46) }));
  assert.equal((await db.machineSet.findUniqueOrThrow({ where: { id: setId } })).description,
    before.description);

  // Two real PG connections and workstations compete to create an asset
  // with the same (machineId, code). Exactly one commit and one audit.
  const raceCode = "ci_race_" + n;
  const race = await Promise.allSettled([
    directCreate(db, 0, body("Racing item 0", raceCode)),
    directCreate(other, 1, body("Racing item 1", raceCode)),
  ]);
  assert.equal(race.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(race.filter(x => x.status === "rejected").length, 1);
  assert.equal(race.find(x => x.status === "rejected").reason.code, "asset_code_in_use");
  const winner = race.find(x => x.status === "fulfilled").value;
  sets.push(winner.id);
  assert.equal((await audits(winner.id, "andon.machine_set.settings.create")).length, 1);
  assert.equal(await db.machineSet.count({ where: { machineId, code: raceCode } }), 1);

  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  assert.equal((await send("PATCH", 0, setId, { description: "revoked" })).statusCode, 403);
  process.env.ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED = "0";
  const disabledAgain = await send("PATCH", 1, setId, { description: "OFF" });
  assert.equal(disabledAgain.statusCode, 403);
  assert.equal(disabledAgain.json().error, "central_action_not_supported");

  console.log("R12-04D1 machine-set PG PASS: role-agnostic global settings and selected scope; CSRF/Origin/flag, POST/PATCH, DELETE denied, live/history snapshots, active children, 2-workstation race, audit rollback and revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", old.central);
  restore("ANDON_CENTRAL_MACHINE_SET_SETTINGS_HTTP_ENABLED", old.sets);
  restore("ANDON_ACCESS_ORIGIN", old.origin);
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  if (subsetId) await db.machineSubset.deleteMany({ where: { id: subsetId } });
  if (sets.length) await db.machineSet.deleteMany({ where: { id: { in: sets } } });
  await db.machineSetType.deleteMany({ where: { id: typeId } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: { in: stationIds } } });
  await other.$disconnect();
  await db.$disconnect();
}
