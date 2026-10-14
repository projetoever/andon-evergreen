import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { enforceWorkstationAccess } from "./workstationAccess.js";
import { createAdminSession, enforceAdminAuthorization } from "./adminAuthorization.js";

const id = "ws_00000000-0000-4000-8000-000000000037";

test("module policy protects direct reads/writes and preserves priorities, recovery and legacy clients", async (t) => {
  let station = { active: true, allowOperational: true, allowBi: true };
  const originalLookup = prisma.workstation.findUnique;
  prisma.workstation.findUnique = (async () => station) as unknown as typeof originalLookup;
  t.after(() => {
    prisma.workstation.findUnique = originalLookup;
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
    "/api/modules/access",
    "/api/workstations",
    `/api/workstations/${id}`,
    "/api/modules/settings",
  ]) {
    app.route({ url, method: ["GET", "POST", "PATCH"], handler: async () => ({ ok: true }) });
  }
  const headers = { origin: "http://andon.test", "x-andon-workstation-id": id };
  for (const allowOperational of [true, false])
    for (const allowBi of [true, false]) {
      station = { active: true, allowOperational, allowBi };
      for (const [url, method, allowed] of [
        ["/api/machines", "GET", allowOperational],
        ["/api/andon-calls", "POST", allowOperational],
        ["/api/analytics/overview", "GET", allowBi],
        ["/api/analytics/filter-options", "GET", allowBi],
        ["/api/dashboard-priority/order", "GET", true],
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
  const admin = createAdminSession("admin");
  const adminHeaders = { ...headers, authorization: `Bearer ${admin.token}` };
  assert.equal(
    (await app.inject({ url: "/api/machines", headers: adminHeaders })).statusCode,
    403,
    "Admin must not bypass operational restrictions",
  );
  station = { ...station, active: false };
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
