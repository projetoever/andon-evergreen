import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { PrismaClient } from "@prisma/client";
import { tokenHash, csrfToken } from "../dist/access/credentials.js";
import { enforceWorkstationAccess } from "../dist/security/workstationAccess.js";
import { enforceAdminAuthorization } from "../dist/security/adminAuthorization.js";
import { enforceModuleAuthorization } from "../dist/security/moduleAuthorization.js";
import { registerMachineRoutes } from "../dist/routes/machines.js";

// CI disposable PostgreSQL ONLY; never user's HML or industrial database.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (process.env.ANDON_INTEGRATION_TEST !== "1" || url.pathname !== "/andon_test" ||
    process.env.ANDON_CENTRAL_ACCESS_ENABLED === "1" ||
    process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED === "1")
  throw Error("H2 requires test-only /andon_test and central/inventory flags OFF initially");

const db = new PrismaClient();
const n = randomUUID().replaceAll("-", "").slice(0, 12);
const ids = [0, 1, 2].map(i => "ci-h2-" + n + "-" + i);
const ws = "ws_" + randomUUID();
const login = "ci.h2." + n;
const token = randomBytes(32).toString("hex");
const old = {
  central: process.env.ANDON_CENTRAL_ACCESS_ENABLED,
  inventory: process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED,
  metadata: process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED,
  origin: process.env.ANDON_ACCESS_ORIGIN,
};
let app, userId;
function reset() {
  const source = {
    ANDON_CENTRAL_ACCESS_ENABLED: old.central,
    ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED: old.inventory,
    ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED: old.metadata,
    ANDON_ACCESS_ORIGIN: old.origin,
  };
  for (const [key, val] of Object.entries(source)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
}
try {
  await db.machine.createMany({ data: ids.map((id, i) => ({
    id, name: "H2 inventory " + i, isActive: true,
    machineStatus: i === 2 ? "stopped" : "running",
    andonStatus: i === 2 ? "maintenance" : "normal",
    productionMode: "scheduled", requireWorkOrderAtOpen: i === 1,
  })) });
  await db.workstation.create({ data: {
    id: ws, active: true, pendingApproval: false, allowOperational: true,
  } });
  const user = await db.accessUser.create({ data: {
    login, displayName: "H2 delegated machine catalog", roleLabel: "Produção",
    accountType: "person", active: true, isPrimaryAdmin: false,
    machineScope: "selected", passwordHash: "CI unusable credential",
    mustChangePassword: false,
    permissions: { create: [
      { key: "andon.read" }, { key: "andon.settings.open" },
    ] },
    machines: { create: [{ machineId: ids[0] }] },
  } });
  userId = user.id;
  const now = new Date();
  await db.accessSession.create({ data: {
    tokenHash: tokenHash(token), userId, workstationId: ws,
    purpose: "normal", authorizationVersion: user.authorizationVersion,
    createdAt: now, lastInteractionAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
  } });

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "0";
  process.env.ANDON_CENTRAL_MACHINE_SETTINGS_HTTP_ENABLED = "1";
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
  await registerMachineRoutes(app);
  const headers = {
    origin: "https://andon.test", "x-andon-workstation-id": ws,
    cookie: "__Host-andon-access=" + token,
    "x-andon-csrf": csrfToken(token),
  };
  const request = (method, path, payload, extra = {}) =>
    app.inject({ method, url: path, headers: { ...headers, ...extra },
      ...(payload === undefined ? {} : { payload }),
    });
  const inventoryPath = "/api/andon-settings/machines";
  const inventory = (q = "", extra = {}) =>
    request("GET", inventoryPath + q, undefined, extra);

  assert.equal((await inventory()).statusCode, 403, "feature flag OFF");
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "1";
  for (const q of ["?includeCalls=1", "?productionEvents=true", "?limit=201",
    "?cursor=../../secret"]) {
    assert.equal((await inventory(q)).statusCode, 400, q);
  }
  assert.equal((await inventory("", { cookie: "" })).statusCode, 401);
  assert.equal((await inventory("", { origin: "https://invalid.example" })).statusCode, 403);
  assert.equal((await request("PATCH", inventoryPath, { isActive: false })).statusCode, 403);

  let cursor = null;
  const result = [];
  let iterations = 0;
  do {
    const q = cursor ? "?limit=1&cursor=" + encodeURIComponent(cursor) : "?limit=1";
    const response = await inventory(q);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "no-store");
    const page = response.json();
    assert(page.items.length <= 1);
    for (const row of page.items) {
      assert.deepEqual(Object.keys(row).sort(),
        ["id", "name", "requireWorkOrderAtOpen", "isActive"].sort());
      assert(!JSON.stringify(row).includes("productionEvents"));
      result.push(row);
    }
    cursor = page.nextCursor;
    if (++iterations > 500) throw Error("H2 pagination did not converge");
  } while (cursor);
  for (const id of ids) assert(result.some(row => row.id === id),
    "global sanitized inventory includes static metadata for each machine");

  const scoped = await request("GET", "/api/machines?includeInactive=true");
  assert.equal(scoped.statusCode, 200, scoped.body);
  assert(scoped.json().some(row => row.id === ids[0]));
  assert(!scoped.json().some(row => row.id === ids[1] || row.id === ids[2]),
    "operational list stays machineScope selected");
  assert.equal((await request("GET", "/api/machines/" + ids[2])).statusCode, 404);

  const bad = await request("PATCH", "/api/machines/" + ids[2],
    { productionMode: "not_scheduled" });
  assert.equal(bad.statusCode, 400, bad.body);
  const changed = await request("PATCH", "/api/machines/" + ids[2], {
    name: "Safe H2 machine name", requireWorkOrderAtOpen: true,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.deepEqual(Object.keys(changed.json()).sort(),
    ["id", "name", "requireWorkOrderAtOpen", "isActive"].sort(),
    "out-of-scope PATCH must not return the full operational machineSelect");
  assert.equal(changed.json().name, "Safe H2 machine name");
  assert.equal((await db.machine.findUniqueOrThrow({ where: { id: ids[2] } }))
    .machineStatus, "stopped");
  const audit = await db.auditEvent.findFirstOrThrow({
    where: { action: "andon.machine.metadata.update", resourceId: ids[2] },
  });
  assert.equal(audit.actorUserId, userId);

  await db.accessPermission.deleteMany({
    where: { userId, key: "andon.settings.open" },
  });
  assert.equal((await inventory()).statusCode, 403);
  assert.equal((await request("PATCH", "/api/machines/" + ids[2],
    { name: "FORBIDDEN" })).statusCode, 403);
  process.env.ANDON_CENTRAL_MACHINE_INVENTORY_HTTP_ENABLED = "0";
  assert.equal((await inventory()).statusCode, 403);

  console.log("R12-04H2 sanitized global machine inventory PG PASS: GET flag OFF, cursor paging, selected-scope operations isolated, four fields only, out-of-scope PATCH sanitized, CSRF metadata, Origin, audit and revocation");
} finally {
  if (app) await app.close();
  reset();
  if (userId) {
    await db.accessSession.deleteMany({ where: { userId } });
    await db.accessPermission.deleteMany({ where: { userId } });
    await db.accessMachine.deleteMany({ where: { userId } });
    await db.accessUser.deleteMany({ where: { id: userId } });
  }
  await db.workstation.deleteMany({ where: { id: ws } });
  await db.machine.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}
