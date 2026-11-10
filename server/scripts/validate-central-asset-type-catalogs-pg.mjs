import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerMachineCatalogRoutes } from "../dist/routes/machineCatalogs.js";
import { createCentralAssetType, updateCentralAssetType } from "../dist/access/centralAssetTypeCatalog.js";

// No HML or industrial DB writes. This executable requires the CI-only
// disposable /andon_test database and starts with central flags disabled.
const dbUrl = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || dbUrl.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED === "1")
  throw Error("R12-04E requires isolated /andon_test and both flags OFF initially");

const db = new PrismaClient();
const other = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const machineId = "ci04e-machine-" + n;
const setCode = "ci04e_set_" + n;
const subsetCode = "ci04e_subset_" + n;
const stations = [0, 1, 2].map(() => "ws_" + randomUUID());
const tokens = [0, 1, 2].map(() => randomBytes(32).toString("hex"));
const userIds = [];
const typeIds = { set: [], subset: [] };
let setId, subsetId, callId, app;
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  types: process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
function restore(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
function body(kind, code) {
  return {
    code, name: kind === "set" ? "CI Type Mechanical " + n : "CI Type Bearing " + n,
    description: "CI-only generic equipment type", isActive: true, displayOrder: 2,
  };
}
const audits = (kind, id, verb) => db.auditEvent.findMany({
  where: {
    resourceType: kind === "set" ? "machine_set_type" : "machine_subset_type",
    resourceId: id, action: "andon.machine_" + (kind === "set" ? "set" : "subset") +
      "_type.settings." + verb,
  },
});
function directCreate(client, index, kind, payload, extra = {}) {
  return createCentralAssetType(client, {
    token: tokens[index], workstationId: stations[index],
    kind, body: payload, requestId: "ci04e-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}
function directPatch(client, index, kind, typeId, payload, extra = {}) {
  return updateCentralAssetType(client, {
    token: tokens[index], workstationId: stations[index],
    kind, typeId, body: payload, requestId: "ci04e-" + n,
    ipAddress: "127.0.0.1", ...extra,
  });
}

try {
  await db.machine.create({ data: {
    id: machineId, name: "CI asset type lab machine " + n, isActive: true,
  } });
  await db.workstation.createMany({ data: stations.map(id => ({
    id, active: true, pendingApproval: false, allowOperational: true,
  })) });
  for (let i = 0; i < 3; i++) {
    const user = await db.accessUser.create({ data: {
      login: "ci.04e.types." + i + "." + n,
      displayName: "CI type editor " + i,
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
  process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "0";
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
  await registerMachineCatalogRoutes(app);

  function send(kind, method, index, id, payload, headersExtra = {}) {
    const path = kind === "set" ? "/api/machine-set-types" : "/api/machine-subset-types";
    return app.inject({
      method, url: path + (id === null ? "" : "/" + id),
      headers: {
        origin: "https://andon.test",
        "x-andon-workstation-id": stations[index],
        cookie: "__Host-andon-access=" + tokens[index],
        "x-andon-csrf": csrfToken(tokens[index]), ...headersExtra,
      },
      ...(payload === undefined ? {} : { payload }),
    });
  }

  for (const kind of ["set", "subset"]) {
    const typeCode = kind === "set" ? setCode : subsetCode;
    const readWhileOff = await send(kind, "GET", 0, null);
    assert.equal(readWhileOff.statusCode, 200, readWhileOff.body);
    assert(Array.isArray(readWhileOff.json()));
    const disabled = await send(kind, "POST", 0, null, body(kind, typeCode));
    assert.equal(disabled.statusCode, 403, disabled.body);
    assert.equal(disabled.json().error, "central_action_not_supported");
  }
  process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "1";

  for (const kind of ["set", "subset"]) {
    const typeCode = kind === "set" ? setCode : subsetCode;
    assert.equal((await send(kind, "POST", 0, null, body(kind, typeCode),
      { cookie: "" })).statusCode, 401);
    assert.equal((await send(kind, "POST", 0, null, body(kind, typeCode),
      { "x-andon-csrf": "0".repeat(64) })).statusCode, 403);
    assert.equal((await send(kind, "POST", 0, null, body(kind, typeCode),
      { origin: "https://evil.invalid" })).statusCode, 403);
    assert.equal((await send(kind, "POST", 2, null, body(kind, typeCode))).statusCode, 403);
    for (const invalid of [
      { ...body(kind, typeCode), machineId: machineId },
      { ...body(kind, typeCode), id: "forged" },
      { ...body(kind, typeCode), pinHash: "spoof" },
      { ...body(kind, typeCode), code: "%%" },
      { ...body(kind, typeCode), isActive: "true" },
      { ...body(kind, typeCode), displayOrder: -1 },
    ]) assert.equal((await send(kind, "POST", 0, null, invalid)).statusCode, 400);

    const created = await send(kind, "POST", 0, null, body(kind, typeCode));
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().code, typeCode);
    const id = created.json().id;
    typeIds[kind].push(id);
    assert.equal((await audits(kind, id, "create")).length, 1);
    assert.equal((await send(kind, "POST", 0, null, body(kind, typeCode))).statusCode, 409);
    const list = await send(kind, "GET", 1, null);
    assert.equal(list.statusCode, 200, list.body);
    assert(list.json().some(x => x.id === id));
    const patch = await send(kind, "PATCH", 1, id, {
      description: "Changed description on " + kind, displayOrder: 5,
    });
    assert.equal(patch.statusCode, 200, patch.body);
    assert.equal(patch.json().description, "Changed description on " + kind);
    const change = (await audits(kind, id, "update"))[0];
    assert.equal(change.actorUserId, userIds[1]);
    assert.equal(change.workstationId, stations[1]);
    assert.equal(change.before.displayOrder, 2);
    assert.equal(change.after.displayOrder, 5);
    assert(!JSON.stringify(change).includes(tokens[1]));
    assert.equal((await send(kind, "DELETE", 0, id)).statusCode, 403);
  }

  // A new set+subset reference both type catalogs, and an actual call holds
  // snapshot strings. Reinterpreting a referenced type must be rejected.
  const set = await db.machineSet.create({ data: {
    machineId, name: "CI motor " + n, code: "ci_motor_" + n,
    typeId: typeIds.set[0], type: setCode, isActive: true,
  } });
  setId = set.id;
  const subset = await db.machineSubset.create({ data: {
    machineSetId: setId, name: "CI bearing " + n,
    code: "ci_bearing_" + n, typeId: typeIds.subset[0], isActive: true,
  } });
  subsetId = subset.id;
  const call = await db.andonCall.create({ data: {
    machineId, machineSetId: setId, machineSubsetId: subsetId,
    machineSetCodeSnapshot: set.code, machineSetNameSnapshot: set.name,
    machineSetTypeSnapshot: setCode,
    machineSubsetCodeSnapshot: subset.code,
    machineSubsetNameSnapshot: subset.name,
    machineSubsetTypeSnapshot: subsetCode,
    category: "maintenance", subtype: "mechanical",
    status: "open", criticality: "medium", openedAt: new Date(),
  } });
  callId = call.id;

  for (const kind of ["set", "subset"]) {
    const id = typeIds[kind][0];
    const inUse = await send(kind, "PATCH", 0, id,
      { code: "changed_type_" + n });
    assert.equal(inUse.statusCode, 409, inUse.body);
    assert.equal(inUse.json().error, "asset_type_in_use");
    const inUseName = await send(kind, "PATCH", 0, id,
      { name: "Changed identity in history" });
    assert.equal(inUseName.statusCode, 409, inUseName.body);
    assert.equal(inUseName.json().error, "asset_type_in_use");
    const deactivation = await send(kind, "PATCH", 0, id, { isActive: false });
    assert.equal(deactivation.statusCode, 409, deactivation.body);
    assert.equal(deactivation.json().error, "asset_type_active_asset");
  }
  await db.andonCall.update({
    where: { id: callId }, data: { status: "finished" },
  });
  const afterCall = await db.andonCall.findUniqueOrThrow({ where: { id: callId } });
  assert.equal(afterCall.machineSetTypeSnapshot, setCode);
  assert.equal(afterCall.machineSubsetTypeSnapshot, subsetCode);

  // Failed append-only audit MUST undo the preceding catalog change.
  const before = await db.machineSetType.findUniqueOrThrow({
    where: { id: typeIds.set[0] },
  });
  await assert.rejects(directPatch(db, 0, "set", typeIds.set[0],
    { description: "Cannot commit without audit" }, { ipAddress: "x".repeat(46) }));
  assert.equal((await db.machineSetType.findUniqueOrThrow({
    where: { id: typeIds.set[0] },
  })).description, before.description);

  // The global catalog lock prevents concurrent same-code creation by two
  // different humans/workstations/Prisma clients, without a partial audit.
  for (const kind of ["set", "subset"]) {
    const code = "ci04e_race_" + kind + "_" + n;
    const contenders = await Promise.allSettled([
      directCreate(db, 0, kind, { name: "Race type 0 " + n, code }),
      directCreate(other, 1, kind, { name: "Race type 1 " + n, code }),
    ]);
    assert.equal(contenders.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(contenders.filter(x => x.status === "rejected").length, 1);
    assert.equal(contenders.find(x => x.status === "rejected").reason.code,
      "asset_type_code_in_use");
    const winner = contenders.find(x => x.status === "fulfilled").value;
    typeIds[kind].push(winner.id);
    assert.equal((await audits(kind, winner.id, "create")).length, 1);
  }

  await db.accessPermission.deleteMany({
    where: { userId: userIds[0], key: "andon.settings.open" },
  });
  assert.equal((await send("set", "PATCH", 0, typeIds.set[0],
    { description: "unauthorized" })).statusCode, 403);
  process.env.ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED = "0";
  const flagSwitchedOff = await send("subset", "PATCH", 1, typeIds.subset[0],
    { description: "disabled" });
  assert.equal(flagSwitchedOff.statusCode, 403);
  assert.equal(flagSwitchedOff.json().error, "central_action_not_supported");

  console.log("R12-04E asset type catalogs PG PASS: existing GETs, 2 type families POST/PATCH, flag OFF/DELETE denied, roles and selected scope, CSRF/Origin, active reference+historical snapshots, two-workstation races, atomic audit rollback and revocation");
} finally {
  if (app) await app.close();
  restore("ANDON_CENTRAL_ACCESS_ENABLED", old.central);
  restore("ANDON_CENTRAL_ASSET_TYPE_CATALOG_HTTP_ENABLED", old.types);
  restore("ANDON_ACCESS_ORIGIN", old.origin);
  if (callId) await db.andonCall.deleteMany({ where: { id: callId } });
  if (subsetId) await db.machineSubset.deleteMany({ where: { id: subsetId } });
  if (setId) await db.machineSet.deleteMany({ where: { id: setId } });
  await db.machineSetType.deleteMany({ where: { id: { in: typeIds.set } } });
  await db.machineSubsetType.deleteMany({ where: { id: { in: typeIds.subset } } });
  await db.machine.deleteMany({ where: { id: machineId } });
  for (const userId of userIds) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: { in: stations } } });
  await other.$disconnect();
  await db.$disconnect();
}
