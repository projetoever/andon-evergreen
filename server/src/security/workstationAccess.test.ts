import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { enforceWorkstationAccess } from "./workstationAccess.js";
import { createAdminSession, enforceAdminAuthorization } from "./adminAuthorization.js";
import { scopedMachineReadIds } from "./centralScopedMachineReads.js";

const id = "ws_00000000-0000-4000-8000-000000000037";

test("module policy protects direct reads/writes and preserves priorities, recovery and legacy clients", async (t) => {
  let station = { active: true, allowOperational: true, allowBi: true, allowPriorities: true };
  const originalPolicy = prisma.systemSettings.findUnique;
  prisma.systemSettings.findUnique = (async () => null) as unknown as typeof originalPolicy;
  const originalLookup = prisma.workstation.findUnique;
  prisma.workstation.findUnique = (async () => station) as unknown as typeof originalLookup;
  t.after(() => {
    prisma.workstation.findUnique = originalLookup;
    prisma.systemSettings.findUnique = originalPolicy;
  });
  const app = Fastify();
  app.addHook("preHandler", enforceWorkstationAccess);
  app.addHook("preHandler", enforceAdminAuthorization);
  for (const url of [
    "/api/machines",
    "/api/andon-calls",
    "/api/analytics/overview",
    "/api/analytics/filter-options",
    "/api/dashboard-priority/order",
    "/api/dashboard-priority/access-status",
    "/api/dashboard-priority/credentials",
    "/api/modules/access",
    "/api/workstations",
    `/api/workstations/${id}`,
    "/api/modules/settings",
  ]) {
    app.route({
      url,
      method: ["GET", "POST", "PATCH", "PUT"],
      handler: async () => ({ ok: true }),
    });
  }
  const headers = { origin: "http://andon.test", "x-andon-workstation-id": id };
  for (const allowOperational of [true, false])
    for (const allowBi of [true, false])
      for (const allowPriorities of [true, false]) {
        station = { active: true, allowOperational, allowBi, allowPriorities };
        for (const [url, method, allowed] of [
          ["/api/machines", "GET", allowOperational],
          ["/api/andon-calls", "POST", allowOperational],
          ["/api/analytics/overview", "GET", allowBi],
          ["/api/analytics/filter-options", "GET", allowBi],
          ["/api/dashboard-priority/order", "GET", allowPriorities],
        ] as const) {
          const response = await app.inject({
            url,
            method,
            headers: { ...headers, "x-andon-module": "priorities" },
          });
          assert.equal(
            response.statusCode,
            allowed ? 200 : 403,
            `${allowOperational}/${allowBi} ${method} ${url}`,
          );
          if (!allowed) assert.equal(response.json().error, "module_forbidden");
        }
      }
  station.allowPriorities = true;
  const admin = createAdminSession("admin");
  const adminHeaders = { ...headers, authorization: `Bearer ${admin.token}` };
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: adminHeaders })).statusCode,
    403,
    "Admin must not bypass operational restrictions",
  );
  station = { ...station, active: false };
  assert.equal(
    (await app.inject({ url: "/api/dashboard-priority/access-status", headers: adminHeaders }))
      .statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/dashboard-priority/credentials",
        method: "PUT",
        headers: adminHeaders,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/dashboard-priority/credentials", method: "PUT", headers }))
      .statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/dashboard-priority/order", headers: adminHeaders })).statusCode,
    403,
    "Central Admin must not bypass an inactive station to use Priorities",
  );
  assert.equal((await app.inject({ url: "/api/modules/access", headers })).statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/workstations", headers: adminHeaders })).statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: `/api/workstations/${id}`, method: "PATCH", headers: adminHeaders }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/modules/settings", method: "PATCH", headers: adminHeaders }))
      .statusCode,
    200,
  );
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: adminHeaders })).json().error,
    "workstation_inactive",
  );
  assert.equal((await app.inject({ url: "/api/workstations", headers })).statusCode, 403);
  station.active = true;
  assert.equal(
    (await app.inject({ url: "/api/dashboard-priority/credentials", method: "PUT", headers }))
      .statusCode,
    401,
  );
  assert.equal((await app.inject({ url: "/api/workstations", headers })).statusCode, 401);
  assert.equal(
    (await app.inject({ url: "/api/modules/settings", method: "PATCH", headers })).statusCode,
    401,
  );
  assert.equal(
    (await app.inject({ url: "/api/machines" })).statusCode,
    200,
    "Legacy client without Origin/UUID remains compatible",
  );
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: { origin: "http://andon.test" } }))
      .statusCode,
    403,
  );
  await app.close();
});

test("central access binds scoped machine/call reads and protects history with additional rights", async (t) => {
  const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const previousOrigin = process.env.ANDON_ACCESS_ORIGIN;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  process.env.ANDON_ACCESS_ORIGIN = "https://andon.test";
  const originalStation = prisma.workstation.findUnique;
  const originalSession = prisma.accessSession.findUnique;
  let machineScope = "all";
  let canReadHistory = false;
  let canReadBi = false;
  let canReadPriorities = false;
  let sessionWorkstationId = id;
  prisma.workstation.findUnique = (async () => ({
    active: true,
    allowOperational: true,
    allowBi: true,
    allowPriorities: true,
  })) as unknown as typeof originalStation;
  prisma.accessSession.findUnique = (async () => ({
    id: "session-central",
    workstationId: sessionWorkstationId,
    purpose: "normal",
    authorizationVersion: 1,
    revokedAt: null,
    createdAt: new Date(),
    lastInteractionAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    workstation: { active: true, pendingApproval: false },
    user: {
      id: "user-central",
      login: "central.user",
      displayName: "Central User",
      roleLabel: "Gestor",
      accountType: "person",
      isPrimaryAdmin: false,
      active: true,
      mustChangePassword: false,
      authorizationVersion: 1,
      machineScope,
      permissions: [
        { key: "andon.read" },
        ...(canReadHistory ? [{ key: "history.read" }] : []),
        ...(canReadBi ? [{ key: "bi.read" }] : []),
        ...(canReadPriorities ? [{ key: "priorities.read" }] : []),
      ],
      machines: [{ machineId: "37" }],
    },
  })) as unknown as typeof originalSession;
  t.after(() => {
    prisma.workstation.findUnique = originalStation;
    prisma.accessSession.findUnique = originalSession;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
    if (previousOrigin === undefined) delete process.env.ANDON_ACCESS_ORIGIN;
    else process.env.ANDON_ACCESS_ORIGIN = previousOrigin;
  });

  const app = Fastify();
  t.after(() => app.close());
  app.addHook("onRequest", async (request) => {
    Object.defineProperty(request.raw.socket, "encrypted", { value: true, configurable: true });
  });
  app.addHook("preHandler", enforceWorkstationAccess);
  app.route({
    url: "/api/machines",
    method: ["GET", "PATCH"],
    handler: async (request) => ({
      ok: true,
      allowedMachineIds: request.method === "GET" ? scopedMachineReadIds(request) : null,
    }),
  });
  app.get("/api/machines/:id", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/andon-calls", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/andon-calls/history", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/analytics/filter-options", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/analytics/machine-360", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/analytics/drilldown", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/dashboard-priority/order", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.put("/api/dashboard-priority/order", async () => ({ ok: true }));
  app.get("/api/analytics/overview", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/analytics/maintenance", async (request) => ({
    allowedMachineIds: scopedMachineReadIds(request),
  }));
  app.get("/api/modules/settings", async () => ({ ok: true }));
  const token = "a".repeat(64);
  const headers = {
    origin: "https://andon.test",
    "x-andon-workstation-id": id,
    cookie: `__Host-andon-access=${token}`,
  };

  assert.equal(
    (await app.inject({ url: "/api/machines", headers: { origin: headers.origin } })).statusCode,
    403,
    "central mode never inherits the no-UUID legacy bypass",
  );
  assert.equal((await app.inject({ url: "/api/machines", headers })).statusCode, 200);
  const mutation = await app.inject({ url: "/api/machines", method: "PATCH", headers });
  assert.equal(mutation.statusCode, 403);
  assert.equal(mutation.json().error, "central_action_not_supported");
  machineScope = "selected";
  const scoped = await app.inject({ url: "/api/machines", headers });
  assert.equal(scoped.statusCode, 200);
  assert.deepEqual(scoped.json().allowedMachineIds, ["37"]);
  const machineDetail = await app.inject({ url: "/api/machines/37", headers });
  assert.equal(machineDetail.statusCode, 200);
  assert.deepEqual(machineDetail.json().allowedMachineIds, ["37"]);
  const machineHead = await app.inject({ method: "HEAD", url: "/api/machines/37", headers });
  assert.equal(machineHead.statusCode, 200);
  const liveCalls = await app.inject({ url: "/api/andon-calls", headers });
  assert.equal(liveCalls.statusCode, 200);
  assert.deepEqual(liveCalls.json().allowedMachineIds, ["37"]);
  const liveCallsHead = await app.inject({ method: "HEAD", url: "/api/andon-calls", headers });
  assert.equal(liveCallsHead.statusCode, 200);
  const historyWithoutPermission = await app.inject({ url: "/api/andon-calls/history", headers });
  assert.equal(historyWithoutPermission.statusCode, 403);
  assert.equal(historyWithoutPermission.json().error, "permission_denied");
  const deniedHistoryHead = await app.inject({ method: "HEAD", url: "/api/andon-calls/history", headers });
  assert.equal(deniedHistoryHead.statusCode, 403);
  canReadHistory = true;
  const history = await app.inject({ url: "/api/andon-calls/history", headers });
  assert.equal(history.statusCode, 200);
  assert.deepEqual(history.json().allowedMachineIds, ["37"]);
  const historyHead = await app.inject({ method: "HEAD", url: "/api/andon-calls/history", headers });
  assert.equal(historyHead.statusCode, 200);
  const deniedBi = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(deniedBi.statusCode, 403);
  assert.equal(deniedBi.json().error, "permission_denied");
  const deniedMachine360 = await app.inject({ url: "/api/analytics/machine-360", headers });
  assert.equal(deniedMachine360.statusCode, 403);
  assert.equal(deniedMachine360.json().error, "permission_denied");
  const deniedDrilldown = await app.inject({ url: "/api/analytics/drilldown", headers });
  assert.equal(deniedDrilldown.statusCode, 403);
  assert.equal(deniedDrilldown.json().error, "permission_denied");
  const deniedPriorities = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(deniedPriorities.statusCode, 403);
  assert.equal(deniedPriorities.json().error, "permission_denied");

  canReadBi = true;
  canReadPriorities = true;
  const biFilters = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(biFilters.statusCode, 200);
  assert.deepEqual(biFilters.json().allowedMachineIds, ["37"]);
  const machine360 = await app.inject({ url: "/api/analytics/machine-360", headers });
  assert.equal(machine360.statusCode, 200);
  assert.deepEqual(machine360.json().allowedMachineIds, ["37"]);
  assert.equal((await app.inject({ method: "HEAD", url: "/api/analytics/machine-360", headers })).statusCode, 200);
  const drilldown = await app.inject({ url: "/api/analytics/drilldown", headers });
  assert.equal(drilldown.statusCode, 200);
  assert.deepEqual(drilldown.json().allowedMachineIds, ["37"]);
  assert.equal((await app.inject({ method: "HEAD", url: "/api/analytics/drilldown", headers })).statusCode, 200);
  const priorityOrder = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(priorityOrder.statusCode, 200);
  assert.deepEqual(priorityOrder.json().allowedMachineIds, ["37"]);
  assert.equal((await app.inject({ method: "HEAD", url: "/api/analytics/filter-options", headers })).statusCode, 200);
  assert.equal((await app.inject({ method: "HEAD", url: "/api/dashboard-priority/order", headers })).statusCode, 200);
  const deniedPriorityWrite = await app.inject({ method: "PUT", url: "/api/dashboard-priority/order", headers });
  assert.equal(deniedPriorityWrite.statusCode, 403);
  assert.equal(deniedPriorityWrite.json().error, "scoped_query_required");
  const scopedOverview = await app.inject({ url: "/api/analytics/overview", headers });
  assert.equal(scopedOverview.statusCode, 200);
  assert.deepEqual(scopedOverview.json().allowedMachineIds, ["37"]);
  assert.equal((await app.inject({ method: "HEAD", url: "/api/analytics/overview", headers })).statusCode, 200);
  const scopedMaintenance = await app.inject({url:"/api/analytics/maintenance",headers});
  assert.equal(scopedMaintenance.statusCode,200);
  assert.deepEqual(scopedMaintenance.json().allowedMachineIds,["37"]);
  assert.equal((await app.inject({method:"HEAD",url:"/api/analytics/maintenance",headers})).statusCode,200);
  machineScope = "all";
  canReadHistory = false;
  const fullScopeHistory = await app.inject({ url: "/api/andon-calls/history", headers });
  assert.equal(fullScopeHistory.statusCode, 403);
  assert.equal(fullScopeHistory.json().error, "permission_denied");
  sessionWorkstationId = id.replace(/37$/, "38");
  assert.equal((await app.inject({ url: "/api/machines", headers })).statusCode, 401);
  sessionWorkstationId = id;
  const unsupported = await app.inject({ url: "/api/modules/settings", headers });
  assert.equal(unsupported.statusCode, 403);
  assert.equal(unsupported.json().error, "central_route_not_supported");
});
