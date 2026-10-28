import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Principal } from "../access/policy.js";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerAnalyticsRoutes } from "./analytics.js";

const principal = (machineScope: "all" | "selected", machineIds: string[]): Principal => ({
  userId: "u_drilldown",
  login: "manager.user",
  displayName: "Manager",
  roleLabel: "Gestor/Gerente",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope,
  machineIds,
  permissions: ["bi.read"],
  sessionId: "s_drilldown",
  workstationId: "ws_22aabbcc-1111-4222-8333-0123456789ab",
  purpose: "normal",
  authenticatedAt: new Date(),
});

const period = "startDate=2026-10-01T00%3A00%3A00-03%3A00&endDate=2026-10-02T00%3A00%3A00-03%3A00";
const url = (dimension: string, value: string, query = "") =>
  `/api/analytics/drilldown?${period}&dimension=${dimension}&value=${value}${query}`;

test("BI drilldown binds per-machine and dimension-wide SQL scopes before reading data", async (t) => {
  const previousFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const original = {
    classifications: prisma.failureClassification.findMany,
    events: prisma.failureEvent.findMany,
    calls: prisma.andonCall.findMany,
  };
  let machineScope: "all" | "selected" = "selected";
  let machineIds: string[] = ["37", "39"];
  let bind = true;
  let policyReads = 0;
  const eventQueries: Array<{ where: Record<string, unknown> }> = [];
  const callQueries: Array<{ where: Record<string, unknown> }> = [];

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  prisma.failureClassification.findMany = (async () => {
    policyReads++;
    return [];
  }) as unknown as typeof original.classifications;
  prisma.failureEvent.findMany = (async (query: unknown) => {
    eventQueries.push(query as { where: Record<string, unknown> });
    return [];
  }) as unknown as typeof original.events;
  prisma.andonCall.findMany = (async (query: unknown) => {
    callQueries.push(query as { where: Record<string, unknown> });
    return [];
  }) as unknown as typeof original.calls;
  t.after(() => {
    prisma.failureClassification.findMany = original.classifications;
    prisma.failureEvent.findMany = original.events;
    prisma.andonCall.findMany = original.calls;
    if (previousFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = previousFlag;
  });

  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    if (bind) bindAuthorizedMachineReadPrincipal(request, principal(machineScope, machineIds));
  });
  await registerAnalyticsRoutes(app);
  t.after(() => app.close());

  const forbidden = await app.inject({ url: url("machine", "38") });
  assert.equal(forbidden.statusCode, 404, forbidden.body);
  assert.equal(forbidden.json().error, "Máquina não encontrada");
  const forbiddenHead = await app.inject({ method: "HEAD", url: url("machine", "38") });
  assert.equal(forbiddenHead.statusCode, 404);
  const forbiddenFilter = await app.inject({
    url: url("classification", "electrical", "&machineId=38"),
  });
  assert.equal(forbiddenFilter.statusCode, 404);
  assert.equal(policyReads, 0, "out-of-scope queries cannot load analytics policy");
  assert.equal(callQueries.length, 0);
  assert.equal(eventQueries.length, 0);

  const allowedMachine = await app.inject({ url: url("machine", "37") });
  assert.equal(allowedMachine.statusCode, 200, allowedMachine.body);
  assert.deepEqual(allowedMachine.json().items, []);
  assert.equal(eventQueries.at(-1)?.where.machineId, "37");

  const byClassification = await app.inject({ url: url("classification", "electrical") });
  assert.equal(byClassification.statusCode, 200, byClassification.body);
  assert.deepEqual(callQueries.at(-1)?.where.machineId, { in: ["37", "39"] });
  assert.equal(callQueries.at(-1)?.where.failureClassification, "electrical");

  const bySector = await app.inject({ url: url("sector", "mechanical", "&machineId=39") });
  assert.equal(bySector.statusCode, 200, bySector.body);
  assert.equal(callQueries.at(-1)?.where.machineId, "39");
  assert.equal(callQueries.at(-1)?.where.subtype, "mechanical");

  machineIds = [];
  const emptyScope = await app.inject({ url: url("sector", "mechanical") });
  assert.equal(emptyScope.statusCode, 200, emptyScope.body);
  assert.deepEqual(callQueries.at(-1)?.where.machineId, { in: [] });

  machineScope = "all";
  const all = await app.inject({ url: url("classification", "electrical") });
  assert.equal(all.statusCode, 200, all.body);
  assert.equal(Object.hasOwn(callQueries.at(-1)?.where ?? {}, "machineId"), false);
  const fullWithFilter = await app.inject({
    url: url("classification", "electrical", "&machineId=38"),
  });
  assert.equal(fullWithFilter.statusCode, 200, fullWithFilter.body);
  assert.equal(callQueries.at(-1)?.where.machineId, "38");

  bind = false;
  const missingBinding = await app.inject({ url: url("sector", "mechanical") });
  assert.equal(missingBinding.statusCode, 403, missingBinding.body);
  assert.equal(missingBinding.json().error, "permission_denied");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = await app.inject({ url: url("sector", "mechanical") });
  assert.equal(legacy.statusCode, 200, legacy.body);
  assert.equal(Object.hasOwn(callQueries.at(-1)?.where ?? {}, "machineId"), false);
});
