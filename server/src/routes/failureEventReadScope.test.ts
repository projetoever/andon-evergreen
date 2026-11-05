import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { prisma } from "../db/prisma.js";
import type { Principal } from "../access/policy.js";
import { bindAuthorizedMachineReadPrincipal } from "../security/centralScopedMachineReads.js";
import { registerFailureEventRoutes } from "./failureEvents.js";

const principal = (scope: "selected" | "all", ids: string[]): Principal => ({
  userId: "refine9-test", login: "production.test", displayName: "Production Test",
  roleLabel: "Produção", accountType: "person", isPrimaryAdmin: false,
  machineScope: scope, machineIds: ids, permissions: ["andon.read"],
  sessionId: "session-test", workstationId: "ws-test",
  purpose: "normal", authenticatedAt: new Date(),
});

test("REFINE9 failure history filters by authenticated machine IDs before LIMIT", async (t) => {
  const flag = process.env.ANDON_CENTRAL_ACCESS_ENABLED;
  const original = prisma.failureEvent.findMany;
  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "1";
  const queries: Array<{ where: Record<string, any>; take: number }> = [];
  prisma.failureEvent.findMany = (async (query: unknown) => {
    queries.push(query as { where: Record<string, any>; take: number });
    return [];
  }) as typeof original;

  let scope: "selected" | "all" = "selected";
  let ids = ["37"];
  let authenticatedBinding = true;
  const app = Fastify();
  app.addHook("preHandler", async (request) => {
    if (authenticatedBinding) bindAuthorizedMachineReadPrincipal(request, principal(scope, ids));
  });
  await registerFailureEventRoutes(app);

  t.after(async () => {
    await app.close();
    prisma.failureEvent.findMany = original;
    if (flag === undefined) delete process.env.ANDON_CENTRAL_ACCESS_ENABLED;
    else process.env.ANDON_CENTRAL_ACCESS_ENABLED = flag;
  });

  const outside = await app.inject({
    url: "/api/failure-events?machineId=39&limit=5&classification=mechanical",
  });
  assert.equal(outside.statusCode, 200, outside.body);
  assert.deepEqual(queries.at(-1)?.where.machineId, { in: [] });
  assert.equal(queries.at(-1)?.where.classification, "mechanical");
  assert.equal(queries.at(-1)?.take, 5);

  const inside = await app.inject({ url: "/api/failure-events?machineId=37" });
  assert.equal(inside.statusCode, 200, inside.body);
  assert.deepEqual(queries.at(-1)?.where.machineId, { in: ["37"] });

  const collection = await app.inject({ url: "/api/failure-events?limit=10" });
  assert.equal(collection.statusCode, 200, collection.body);
  assert.deepEqual(queries.at(-1)?.where.machineId, { in: ["37"] });
  assert.equal(queries.at(-1)?.take, 10);

  ids = [];
  const empty = await app.inject({ url: "/api/failure-events" });
  assert.equal(empty.statusCode, 200, empty.body);
  assert.deepEqual(queries.at(-1)?.where.machineId, { in: [] });

  scope = "all";
  const full = await app.inject({ url: "/api/failure-events?machineId=39" });
  assert.equal(full.statusCode, 200, full.body);
  assert.equal(queries.at(-1)?.where.machineId, "39");

  authenticatedBinding = false;
  const count = queries.length;
  const denied = await app.inject({ url: "/api/failure-events" });
  assert.equal(denied.statusCode, 403, denied.body);
  assert.equal(queries.length, count, "unbound request cannot reach Prisma");

  process.env.ANDON_CENTRAL_ACCESS_ENABLED = "0";
  const legacy = await app.inject({ url: "/api/failure-events?machineId=39" });
  assert.equal(legacy.statusCode, 200, legacy.body);
  assert.equal(queries.at(-1)?.where.machineId, "39");
});
