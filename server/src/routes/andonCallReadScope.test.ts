import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import type { Principal } from "../access/policy.js";
import { callMachineReadWhere } from "../security/callReadScope.js";
import { registerAndonCallRoutes } from "./andonCalls.js";

test("scope clauses always intersect the query filter instead of overriding it", () => {
  assert.deepEqual(callMachineReadWhere(undefined, null), {});
  assert.deepEqual(callMachineReadWhere("39", null), { AND: [{ machineId: "39" }] });
  assert.deepEqual(callMachineReadWhere(undefined, ["37"]), {
    AND: [{ machineId: { in: ["37"] } }],
  });
  assert.deepEqual(callMachineReadWhere("39", ["37"]), {
    AND: [{ machineId: "39" }, { machineId: { in: ["37"] } }],
  });
  assert.deepEqual(callMachineReadWhere(undefined, []), {
    AND: [{ machineId: { in: [] } }],
  });
});

const principal = (scope: "all" | "selected", ids: string[]): Principal => ({
  userId: "person-test",
  login: "person.test",
  displayName: "Person Test",
  roleLabel: "Manutenção",
  accountType: "person",
  isPrimaryAdmin: false,
  machineScope: scope,
  machineIds: ids,
  permissions: ["andon.read", "history.read"],
  sessionId: "session-test",
  workstationId: "ws-test",
  purpose: "normal",
  authenticatedAt: new Date(),
});

test("active calls and history apply machine scope BEFORE ordering and pagination", async (t) => {
  const oldFlag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const original = prisma.andonCall.findMany;
  const sqlQueries: unknown[] = [];
  let selectedIds: string[] = ["37"];
  let scope: "all" | "selected" = "selected";
  prisma.andonCall.findMany = (async (query: unknown) => {
    sqlQueries.push(query);
    // Empty response exercises WHERE without loading unrelated asset records.
    return [];
  }) as typeof original;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  t.after(() => {
    prisma.andonCall.findMany = original;
    if (oldFlag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = oldFlag;
  });
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    bindAuthorizedMachineReadPrincipal(request, principal(scope, selectedIds));
  });
  await registerAndonCallRoutes(app);
  t.after(() => app.close());

  const list = await app.inject({
    method: "GET", url: "/api/andon-calls?machineId=39&status=open&limit=5",
  });
  assert.equal(list.statusCode, 200, list.body);
  const active = sqlQueries.pop() as { where: Record<string, unknown>; take: number };
  assert.deepEqual(active.where, {
    AND: [{ machineId: "39" }, { machineId: { in: ["37"] } }],
    status: "open",
  });
  assert.equal(active.take, 5);

  const history = await app.inject({
    method: "GET",
    url: "/api/andon-calls/history?machineId=39&startDate=2026-10-01&endDate=2026-10-28&limit=10",
  });
  assert.equal(history.statusCode, 200, history.body);
  const historical = sqlQueries.pop() as { where: Record<string, any>; take: number };
  assert.deepEqual(historical.where.AND, [
    { machineId: "39" }, { machineId: { in: ["37"] } },
  ]);
  assert.equal(historical.where.finishedAt.gte instanceof Date, true);
  assert.equal(historical.where.finishedAt.lte instanceof Date, true);
  assert.equal(historical.take, 10);

  selectedIds = [];
  const emptyScope = await app.inject({ method: "GET", url: "/api/andon-calls" });
  assert.equal(emptyScope.statusCode, 200, emptyScope.body);
  const noMachines = sqlQueries.pop() as { where: Record<string, any> };
  assert.deepEqual(noMachines.where.AND, [{ machineId: { in: [] } }]);

  scope = "all";
  const full = await app.inject({ method: "GET", url: "/api/andon-calls?status=open" });
  assert.equal(full.statusCode, 200, full.body);
  const allMachines = sqlQueries.pop() as { where: Record<string, unknown> };
  assert.deepEqual(allMachines.where, { status: "open" });
});
