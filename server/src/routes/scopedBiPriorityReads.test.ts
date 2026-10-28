import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";
import { registerDashboardPriorityRoutes } from "./dashboardPriority.js";

const principal = (scope: "selected" | "all", machines: string[]): Principal => ({
  userId: "u1",
  login: "maintenance.user",
  displayName: "Manutenção",
  roleLabel: "Manutenção",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: scope,
  machineIds: machines,
  permissions: ["bi.read", "priorities.read"],
  sessionId: "s1",
  workstationId: "ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose: "normal",
  authenticatedAt: new Date(),
});

test("priorities order and BI machine selectors apply SQL scope and conceal global editor data", async (t) => {
  const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const originals = {
    machineFind: prisma.machine.findMany,
    priorityConfig: prisma.dashboardPriorityConfig.findUnique,
    sectors: prisma.andonCategory.findMany,
    classifications: prisma.failureClassification.findMany,
  };
  const queries: Array<{ where?: unknown }> = [];
  let scope: "selected" | "all" = "selected";
  let machineIds: string[] = ["37"];
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  prisma.machine.findMany = (async (query: { where?: unknown }) => {
    queries.push(query);
    return [];
  }) as typeof originals.machineFind;
  prisma.dashboardPriorityConfig.findUnique = (async (query: { select?: unknown }) =>
    query.select && "passwordRequired" in query.select
      ? { passwordRequired: false }
      : { lastOrderUpdatedAt: new Date("2026-10-28T10:00:00Z"), lastOrderUpdatedBy: "other.admin" }
  ) as typeof originals.priorityConfig;
  prisma.andonCategory.findMany = (async () => []) as typeof originals.sectors;
  prisma.failureClassification.findMany = (async () => []) as typeof originals.classifications;

  t.after(() => {
    prisma.machine.findMany = originals.machineFind;
    prisma.dashboardPriorityConfig.findUnique = originals.priorityConfig;
    prisma.andonCategory.findMany = originals.sectors;
    prisma.failureClassification.findMany = originals.classifications;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });

  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    bindAuthorizedMachineReadPrincipal(request, principal(scope, machineIds));
  });
  await registerDashboardPriorityRoutes(app);
  await registerAnalyticsRoutes(app);
  t.after(() => app.close());

  const workstation = "ws_" + randomUUID();
  const headers = { "x-andon-workstation-id": workstation };

  const priority = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(priority.statusCode, 200, priority.body);
  assert.deepEqual(queries.pop()?.where, { id: { in: ["37"] } });
  assert.equal(priority.json().lastOrderUpdatedAt, null);
  assert.equal(priority.json().lastOrderUpdatedBy, null);

  const bi = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(bi.statusCode, 200, bi.body);
  assert.deepEqual(queries.pop()?.where, { id: { in: ["37"] } });

  machineIds = [];
  const zero = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(zero.statusCode, 200, zero.body);
  assert.deepEqual(queries.pop()?.where, { id: { in: [] } });

  scope = "all";
  const fullPriority = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(fullPriority.statusCode, 200, fullPriority.body);
  assert.equal(queries.pop()?.where, undefined);
  assert.equal(fullPriority.json().lastOrderUpdatedBy, "other.admin");

  const fullBi = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(fullBi.statusCode, 200, fullBi.body);
  assert.equal(queries.pop()?.where, undefined);
});
