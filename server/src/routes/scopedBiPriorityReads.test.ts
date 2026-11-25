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
    productionEvents: prisma.machineProductionEvent.findMany,
    history: prisma.machinePriorityHistory.findMany,
    sectors: prisma.andonCategory.findMany,
    classifications: prisma.failureClassification.findMany,
  };
  const queries: Array<{ where?: unknown }> = [];
  const productionQueries: Array<{ where?: unknown }> = [];
  const historyQueries: Array<{ where?: unknown; take?: number }> = [];
  let mockedMachineRows: Array<{id: string; name: string; isActive: boolean; productionMode: string; priorityOrder: number; displayOrder: number }> = [];
  let scope: "selected" | "all" = "selected";
  let machineIds: string[] = ["37"];
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  prisma.machine.findMany = (async (query: { where?: unknown }) => {
    queries.push(query);
    return mockedMachineRows;
  }) as unknown as typeof originals.machineFind;
  prisma.machineProductionEvent.findMany = (async (query: { where?: unknown }) => {
    productionQueries.push(query);
    return [{ machineId: "37", productionMode: "scheduled", startedAt: new Date("2026-11-23T15:00:00Z") }];
  }) as unknown as typeof originals.productionEvents;
  prisma.machinePriorityHistory.findMany = (async (query: { where?: unknown; take?: number }) => {
    historyQueries.push(query);
    return [{
      id: "hist-37", machineId: "37", changedAt: new Date("2026-11-23T15:00:00Z"),
      changedBy: "global.manager", previousOrder: 2, newOrder: 1,
      previousPriorityRank: null, newPriorityRank: 1,
    }];
  }) as unknown as typeof originals.history;
  prisma.dashboardPriorityConfig.findUnique = (async (query: { select?: unknown }) =>
    query.select && typeof query.select === "object" && "passwordRequired" in query.select
      ? { passwordRequired: true }
      : { lastOrderUpdatedAt: new Date("2026-10-28T10:00:00Z"), lastOrderUpdatedBy: "other.admin" }
  ) as unknown as typeof originals.priorityConfig;
  prisma.andonCategory.findMany = (async () => []) as typeof originals.sectors;
  prisma.failureClassification.findMany = (async () => []) as typeof originals.classifications;

  t.after(() => {
    prisma.machine.findMany = originals.machineFind;
    prisma.dashboardPriorityConfig.findUnique = originals.priorityConfig;
    prisma.machineProductionEvent.findMany = originals.productionEvents;
    prisma.machinePriorityHistory.findMany = originals.history;
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

  // A verified central user can READ without a redundant priority token,
  // even when the legacy priority password policy remains enabled.
  const priority = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(priority.statusCode, 200, priority.body);
  assert.deepEqual(queries.pop()?.where, { id: { in: ["37"] } });
  assert.equal(priority.json().lastOrderUpdatedAt, null);
  assert.equal(priority.json().lastOrderUpdatedBy, null);
  assert.equal(priority.json().priorityHighlightCount, 5);

  // Validate that schedule values and event timestamps are returned only for
  // SQL-scoped assets; a machine merely updated for another reason is NOT a
  // valid production change timestamp.
  mockedMachineRows = [
    { id: "37", name: "M37", isActive: true, productionMode: "scheduled", priorityOrder: 1, displayOrder: 1 },
  ];
  const withProduction = await app.inject({ url: "/api/dashboard-priority/order", headers });
  assert.equal(withProduction.statusCode, 200, withProduction.body);
  assert.equal(withProduction.json().machines[0].productionMode, "scheduled");
  assert.equal(withProduction.json().machines[0].productionModeChangedAt, "2026-11-23T15:00:00.000Z");
  assert.deepEqual(productionQueries.pop()?.where, { machineId: { in: ["37"] }, endedAt: null });
  mockedMachineRows = [];

  const scopedHistory = await app.inject({ url: "/api/dashboard-priority/history", headers });
  assert.equal(scopedHistory.statusCode, 200, scopedHistory.body);
  assert.equal(scopedHistory.json().entries[0].changedBy, null);
  assert.equal(scopedHistory.json().entries[0].machineId, "37");
  assert.deepEqual(historyQueries.pop()?.where, { machineId: { in: ["37"] } });

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
  assert.equal(fullPriority.json().priorityHighlightCount, 5);

  const fullHistory = await app.inject({ url: "/api/dashboard-priority/history", headers });
  assert.equal(fullHistory.statusCode, 200, fullHistory.body);
  assert.equal(fullHistory.json().entries[0].changedBy, "global.manager");
  assert.equal(historyQueries.pop()?.where, undefined);

  const fullBi = await app.inject({ url: "/api/analytics/filter-options", headers });
  assert.equal(fullBi.statusCode, 200, fullBi.body);
  assert.equal(queries.pop()?.where, undefined);
});

test("priorities read without a central scoped-principal binding fails closed", async (t) => {
  const oldFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  t.after(() => {
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldFlag;
  });
  const app = Fastify();
  t.after(() => app.close());
  await registerDashboardPriorityRoutes(app);
  const response = await app.inject({ url: "/api/dashboard-priority/order" });
  assert.equal(response.statusCode, 403);
  const history = await app.inject({ url: "/api/dashboard-priority/history" });
  assert.equal(history.statusCode, 403);
});
